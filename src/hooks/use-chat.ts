import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatMessage, ReplySource } from '@/lib/chat-types';
import { isDemoMode } from '@/lib/config';
import { mockReply } from '@/lib/mock-reply';
import { ChatError, type ChatErrorCode, serverReply } from '@/lib/nova-api';

/** 画面に出すエラーの種類 */
export type ChatErrorKind = ChatErrorCode | 'generic';

/** 接続先が設定されていればサーバー（本物のAI）、なければデモ返答 */
const defaultReplySource: ReplySource = isDemoMode ? mockReply : serverReply;

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * チャットの状態と操作（送信・停止・再生成・やり直し・新規チャット）をまとめたもの。
 * 回答の作り方（replySource）だけを差し替えれば、画面はそのまま使える。
 */
export function useChat(replySource: ReplySource = defaultReplySource) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChatErrorKind | null>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  const update = useCallback((next: (prev: ChatMessage[]) => ChatMessage[]) => {
    messagesRef.current = next(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  /** 今の会話履歴をもとにAIの回答を作る */
  const runReply = useCallback(
    async (history: ChatMessage[]) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const assistantId = newId();
      setError(null);
      setBusy(true);
      update((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', status: 'streaming' },
      ]);

      try {
        await replySource(history, {
          signal: controller.signal,
          onDelta: (delta) =>
            update((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
            ),
          onReplace: (text) =>
            update((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m))),
        });
        update((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: 'done' } : m)));
      } catch (e) {
        if (controller.signal.aborted) {
          // 停止ボタン：途中まで表示した回答は残す。何も届いていなければ消す。
          update((prev) =>
            prev
              .filter((m) => !(m.id === assistantId && m.content.length === 0))
              .map((m) => (m.id === assistantId ? { ...m, status: 'stopped' } : m)),
          );
        } else {
          // 失敗：書きかけの回答を消してエラーを表示（詳しい内容は画面に出さない）
          update((prev) => prev.filter((m) => m.id !== assistantId));
          setError(e instanceof ChatError ? e.code : 'generic');
          if (__DEV__) console.warn('[NOVA] reply failed', e);
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setBusy(false);
        }
      }
    },
    [replySource, update],
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || controllerRef.current) return;
      update((prev) => [...prev, { id: newId(), role: 'user', content }]);
      void runReply(messagesRef.current);
    },
    [runReply, update],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  /** 最後のAIの回答を消して、もう一度作り直す */
  const regenerate = useCallback(() => {
    if (controllerRef.current) return;
    const list = messagesRef.current;
    const last = list[list.length - 1];
    if (!last || last.role !== 'assistant') return;
    update((prev) => prev.slice(0, -1));
    void runReply(messagesRef.current);
  }, [runReply, update]);

  /** エラーのあと、同じ質問でもう一度試す */
  const retry = useCallback(() => {
    if (controllerRef.current) return;
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (!last || last.role !== 'user') return;
    void runReply(messagesRef.current);
  }, [runReply]);

  const reset = useCallback(() => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.abort();
    setBusy(false);
    setError(null);
    update(() => []);
  }, [update]);

  // 画面を離れたら、回答の受信を止める
  useEffect(() => () => controllerRef.current?.abort(), []);

  return { messages, busy, error, send, stop, regenerate, retry, reset };
}
