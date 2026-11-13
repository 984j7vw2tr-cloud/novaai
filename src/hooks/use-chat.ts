import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Attachment, ChatMessage, ReplySource } from '@/lib/chat-types';
import { isDemoMode } from '@/lib/config';
import {
  createConversation,
  deleteMessage,
  loadMessages,
  saveMessage,
  titleFrom,
} from '@/lib/conversations';
import { mockReply } from '@/lib/mock-reply';
import { ChatError, type ChatErrorCode, type QuotaDetails, serverReply } from '@/lib/nova-api';

/** 画面に出すエラーの種類 */
export type ChatErrorKind = ChatErrorCode | 'generic';

/** 接続先が設定されていればサーバー（本物のAI）、なければデモ返答 */
const defaultReplySource: ReplySource = isDemoMode ? mockReply : serverReply;

type Options = {
  replySource?: ReplySource;
  /** 会話をデータベースに保存するか（デモでは保存しない） */
  persist?: boolean;
  /** 新しい会話が保存されたとき（画面のURLに会話IDを入れるため） */
  onConversationCreated?: (id: string) => void;
  /** 文章なしで写真だけ送ったときの、会話の題名（例：「写真」） */
  attachmentTitle?: (attachments: Attachment[]) => string;
};

/**
 * チャットの状態と操作（送信・停止・再生成・やり直し・新規チャット・読み込み）をまとめたもの。
 * 会話は送信のたびに自動で保存する。保存に失敗しても、チャット自体は続けられる。
 */
export function useChat({
  replySource = defaultReplySource,
  persist = !isDemoMode,
  onConversationCreated,
  attachmentTitle,
}: Options = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChatErrorKind | null>(null);
  /** 回数の上限に達したときの詳細（何回まで・いつから使えるか） */
  const [errorDetails, setErrorDetails] = useState<QuotaDetails | null>(null);
  /** 今日の残り回数（サーバーから届いたら表示する） */
  const [quota, setQuota] = useState<{ limit: number; remaining: number } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const messagesRef = useRef<ChatMessage[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  /** 保存の処理を1つずつ順番に行うための列（順番が入れ替わらないように） */
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  /** 会話を切り替えたら古い保存処理を無視するための番号 */
  const sessionRef = useRef(0);
  const onCreatedRef = useRef(onConversationCreated);
  useEffect(() => {
    onCreatedRef.current = onConversationCreated;
  }, [onConversationCreated]);

  const update = useCallback((next: (prev: ChatMessage[]) => ChatMessage[]) => {
    messagesRef.current = next(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  /** 保存処理を列に並べる。失敗しても次の処理は続ける */
  const enqueue = useCallback(
    (task: (conversationId: string) => Promise<void>) => {
      if (!persist) return;
      const session = sessionRef.current;
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        const id = conversationIdRef.current;
        if (!id || session !== sessionRef.current) return;
        try {
          await task(id);
        } catch (e) {
          if (session === sessionRef.current) setSaveFailed(true);
          if (__DEV__) console.warn('[NAYQO] save failed', e);
        }
      });
    },
    [persist],
  );

  /** 今の会話履歴をもとにAIの回答を作る */
  const runReply = useCallback(
    async (history: ChatMessage[]) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const assistantId = randomUUID();
      setError(null);
      setErrorDetails(null);
      setBusy(true);
      update((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', status: 'streaming' },
      ]);

      const saveAssistant = () => {
        const msg = messagesRef.current.find((m) => m.id === assistantId);
        if (msg && (msg.content.trim() || msg.attachments?.length)) {
          enqueue((cid) => saveMessage(cid, msg));
        }
      };

      try {
        await replySource(history, {
          signal: controller.signal,
          conversationId: conversationIdRef.current,
          // 一時チャットでは、NAYQOは覚えない・思い出さない
          temporary: !persist,
          onQuota: setQuota,
          onStatus: (status) =>
            update((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, pending: status === 'searching' ? 'search' : 'image' }
                  : m,
              ),
            ),
          onImage: (attachment) =>
            update((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      pending: undefined,
                      attachments: [...(m.attachments ?? []), attachment],
                    }
                  : m,
              ),
            ),
          onDelta: (delta) =>
            update((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
            ),
          onReplace: (text) =>
            update((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m))),
        });
        update((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, status: 'done', pending: undefined } : m,
          ),
        );
        saveAssistant();
      } catch (e) {
        if (controller.signal.aborted) {
          // 停止ボタン：途中まで表示した回答は残す（保存もする）。何も届いていなければ消す。
          update((prev) =>
            prev
              .filter(
                (m) => !(m.id === assistantId && m.content.length === 0 && !m.attachments?.length),
              )
              .map((m) => (m.id === assistantId ? { ...m, status: 'stopped' } : m)),
          );
          if (controllerRef.current === controller) saveAssistant();
        } else {
          // 失敗：書きかけの回答を消してエラーを表示（詳しい内容は画面に出さない）
          update((prev) => prev.filter((m) => m.id !== assistantId));
          setError(e instanceof ChatError ? e.code : 'generic');
          setErrorDetails(e instanceof ChatError ? (e.details ?? null) : null);
          // 上限に達したら、古い「残り○回」の表示は消す（上限のお知らせと食い違わないように）
          if (e instanceof ChatError && e.code === 'quota_exceeded') setQuota(null);
          if (__DEV__) console.warn('[NAYQO] reply failed', e);
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setBusy(false);
        }
      }
    },
    [replySource, update, enqueue, persist],
  );

  const send = useCallback(
    (text: string, attachments: Attachment[] = []) => {
      const content = text.trim();
      if ((!content && attachments.length === 0) || controllerRef.current) return false;
      const userMessage: ChatMessage = {
        id: randomUUID(),
        role: 'user',
        content,
        ...(attachments.length ? { attachments } : {}),
      };
      update((prev) => [...prev, userMessage]);
      const history = messagesRef.current;
      const session = sessionRef.current;

      void (async () => {
        // 初めての送信なら、先に会話を作る（使用量の記録にも会話IDを使うため）
        if (persist && !conversationIdRef.current) {
          try {
            const title =
              content ||
              attachmentTitle?.(attachments) ||
              attachments.map((a) => a.name).join(', ');
            const id = await createConversation(titleFrom(title));
            if (session !== sessionRef.current) return;
            conversationIdRef.current = id;
            onCreatedRef.current?.(id);
          } catch (e) {
            setSaveFailed(true);
            if (__DEV__) console.warn('[NAYQO] create conversation failed', e);
          }
        }
        if (session !== sessionRef.current) return;
        enqueue((cid) => saveMessage(cid, userMessage));
        await runReply(history);
      })();
      return true;
    },
    [persist, runReply, update, enqueue, attachmentTitle],
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
    enqueue(() => deleteMessage(last.id));
    void runReply(messagesRef.current);
  }, [runReply, update, enqueue]);

  /** エラーのあと、同じ質問でもう一度試す */
  const retry = useCallback(() => {
    if (controllerRef.current) return;
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (!last || last.role !== 'user') return;
    void runReply(messagesRef.current);
  }, [runReply]);

  /** 新しいチャット（画面を空にして、次の送信で新しい会話を作る） */
  const reset = useCallback(() => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.abort();
    sessionRef.current++;
    conversationIdRef.current = null;
    setBusy(false);
    setError(null);
    setSaveFailed(false);
    setLoadFailed(false);
    update(() => []);
  }, [update]);

  /** 保存してある会話を開く */
  const load = useCallback(
    async (conversationId: string) => {
      reset();
      const session = sessionRef.current;
      conversationIdRef.current = conversationId;
      setLoading(true);
      try {
        const loaded = await loadMessages(conversationId);
        if (session !== sessionRef.current) return;
        update(() => loaded);
      } catch (e) {
        if (session === sessionRef.current) setLoadFailed(true);
        if (__DEV__) console.warn('[NAYQO] load failed', e);
      } finally {
        if (session === sessionRef.current) setLoading(false);
      }
    },
    [reset, update],
  );

  // 画面を離れたら、回答の受信を止める
  useEffect(() => () => controllerRef.current?.abort(), []);

  return {
    messages,
    busy,
    error,
    errorDetails,
    quota,
    saveFailed,
    loading,
    loadFailed,
    send,
    stop,
    regenerate,
    retry,
    reset,
    load,
  };
}
