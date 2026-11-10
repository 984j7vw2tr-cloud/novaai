import { fetch } from 'expo/fetch';

import type { ReplySource } from '@/lib/chat-types';
import { getAccessToken } from '@/auth';
import { getLanguageSettings } from '@/i18n';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';

/** サーバーから返ってくるエラーの種類 */
export type ChatErrorCode =
  | 'invalid_request'
  | 'rate_limited'
  | 'service_unavailable'
  | 'upstream_error'
  | 'unauthorized'
  | 'network';

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  constructor(code: ChatErrorCode) {
    super(code);
    this.name = 'ChatError';
    this.code = code;
  }
}

const KNOWN_CODES: ChatErrorCode[] = [
  'invalid_request',
  'rate_limited',
  'service_unavailable',
  'upstream_error',
  'unauthorized',
];
const toCode = (c: unknown): ChatErrorCode =>
  KNOWN_CODES.includes(c as ChatErrorCode) ? (c as ChatErrorCode) : 'upstream_error';

/**
 * Supabase の chat 関数（サーバー）に会話を送り、AIの回答を少しずつ受け取る。
 * APIキーはサーバー側にあるので、アプリには入っていない。
 */
export const serverReply: ReplySource = async (history, { onDelta, onReplace, signal }) => {
  const settings = await getLanguageSettings();
  // ログインの鍵をつけて送る（サーバーはこれでログイン中の本人か確かめる）
  const accessToken = await getAccessToken();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        messages: history
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content })),
        settings,
      }),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ChatError('network');
  }

  if (!res.ok || !res.body) {
    let code: unknown;
    try {
      code = (await res.json())?.code;
    } catch {
      // JSONでない
    }
    if (res.status === 401) throw new ChatError('unauthorized');
    throw new ChatError(res.status === 429 ? 'rate_limited' : toCode(code));
  }

  // 1行に1つのJSONが届くので、行ごとに読む
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let ev: { type?: string; text?: string; code?: string };
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (ev.type === 'delta' && typeof ev.text === 'string') onDelta(ev.text);
    else if (ev.type === 'replace' && typeof ev.text === 'string') onReplace?.(ev.text);
    else if (ev.type === 'done') finished = true;
    else if (ev.type === 'error') throw new ChatError(toCode(ev.code));
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        handleLine(line);
      }
    }
    handleLine(buffer);
  } catch (e) {
    if (signal.aborted || e instanceof ChatError) throw e;
    throw new ChatError('network');
  }

  // 「終わり」の合図がないまま切れた＝途中で通信が切れた
  if (!finished) throw new ChatError('network');
};
