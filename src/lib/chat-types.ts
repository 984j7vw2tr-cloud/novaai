export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** AIの回答の状態。streaming=表示中 / done=完了 / stopped=途中で停止 */
  status?: 'streaming' | 'done' | 'stopped';
};

/**
 * 回答を作る仕組み（今はデモ、PHASE 4でOpenAIなどにつながるサーバーに差し替える）。
 * 回答は少しずつ届く（ストリーミング）ので、届くたびに onDelta が呼ばれる。
 */
export type ReplySource = (
  history: ChatMessage[],
  options: {
    onDelta: (text: string) => void;
    /** 安全チェックで回答全体が差し替えられたとき */
    onReplace?: (text: string) => void;
    signal: AbortSignal;
    /** 保存中の会話のID（使用量の記録に使う。まだなければ null） */
    conversationId?: string | null;
  },
) => Promise<void>;
