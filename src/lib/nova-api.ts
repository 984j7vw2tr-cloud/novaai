import { fetch } from 'expo/fetch';

import type { Attachment, ReplySource } from '@/lib/chat-types';
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
  | 'quota_exceeded'
  | 'attachment_limit'
  | 'network';

/** 回数の上限に達したときの詳しい情報 */
export type QuotaDetails = { limit?: number; resetAt?: string | null };

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  readonly details?: QuotaDetails;
  constructor(code: ChatErrorCode, details?: QuotaDetails) {
    super(code);
    this.name = 'ChatError';
    this.code = code;
    this.details = details;
  }
}

const KNOWN_CODES: ChatErrorCode[] = [
  'invalid_request',
  'rate_limited',
  'service_unavailable',
  'upstream_error',
  'unauthorized',
  'quota_exceeded',
  'attachment_limit',
];
const toCode = (c: unknown): ChatErrorCode =>
  KNOWN_CODES.includes(c as ChatErrorCode) ? (c as ChatErrorCode) : 'upstream_error';

/**
 * Supabase の chat 関数（サーバー）に会話を送り、AIの回答を少しずつ受け取る。
 * APIキーはサーバー側にあるので、アプリには入っていない。
 */
export const serverReply: ReplySource = async (
  history,
  { onDelta, onReplace, onQuota, onStatus, onImage, signal, conversationId, temporary },
) => {
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
          .filter((m) => m.content.trim().length > 0 || (m.attachments?.length ?? 0) > 0)
          // 作りかけ（まだ何も届いていない）AIの発言は送らない
          .map((m) => ({
            role: m.role,
            content: m.content,
            // 写真・ファイルは場所と名前だけ送る（中身はサーバーが置き場所から取り出す）
            ...(m.attachments?.length
              ? {
                  attachments: m.attachments.map(({ kind, path, name, mime }) => ({
                    kind,
                    path,
                    name,
                    mime,
                  })),
                }
              : {}),
          })),
        settings,
        conversationId: conversationId ?? undefined,
        ...(temporary ? { temporary: true } : {}),
      }),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ChatError('network');
  }

  if (!res.ok || !res.body) {
    let code: unknown;
    let data: { limit?: unknown; resetAt?: unknown } | null = null;
    try {
      data = await res.json();
      code = (data as { code?: unknown })?.code;
    } catch {
      // JSONでない
    }
    if (res.status === 401) throw new ChatError('unauthorized');
    if (code === 'quota_exceeded') {
      throw new ChatError('quota_exceeded', {
        limit: typeof data?.limit === 'number' ? data.limit : undefined,
        resetAt: typeof data?.resetAt === 'string' ? data.resetAt : null,
      });
    }
    // 無料プランの写真・ファイルの上限
    if (code === 'attachment_limit') throw new ChatError('attachment_limit');
    throw new ChatError(res.status === 429 ? 'rate_limited' : toCode(code));
  }

  // 1行に1つのJSONが届くので、行ごとに読む
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let ev: {
      type?: string;
      text?: string;
      code?: string;
      limit?: number;
      remaining?: number;
      status?: string;
      attachment?: Attachment;
    };
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (ev.type === 'delta' && typeof ev.text === 'string') onDelta(ev.text);
    else if (ev.type === 'replace' && typeof ev.text === 'string') onReplace?.(ev.text);
    else if (
      ev.type === 'quota' &&
      typeof ev.limit === 'number' &&
      typeof ev.remaining === 'number'
    )
      onQuota?.({ limit: ev.limit, remaining: ev.remaining });
    else if (
      ev.type === 'status' &&
      (ev.status === 'generating_image' || ev.status === 'searching')
    )
      onStatus?.(ev.status);
    else if (
      ev.type === 'image' &&
      ev.attachment &&
      ev.attachment.kind === 'image' &&
      typeof ev.attachment.path === 'string'
    )
      onImage?.(ev.attachment);
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
