export type ChatRole = 'user' | 'assistant';

/** 発言に付けた写真・ファイル（中身は Supabase Storage にあり、ここには場所と名前だけ持つ） */
export type Attachment = {
  kind: 'image' | 'file';
  /** Storage の中の場所：<ユーザーID>/<ランダムなID>.<拡張子> */
  path: string;
  name: string;
  mime: string;
  /** バイト数 */
  size?: number;
  /** 写真の縦横（表示の比率を決めるため） */
  width?: number;
  height?: number;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** ユーザーが付けた写真・ファイル */
  attachments?: Attachment[];
  /** AIが画像を作っている途中か */
  pending?: 'image' | 'search';
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
    /** 今日の残り回数が届いたとき */
    onQuota?: (quota: { limit: number; remaining: number }) => void;
    /** AIが画像を作り始めたとき */
    onStatus?: (status: 'generating_image' | 'searching') => void;
    /** AIが作った画像が届いたとき */
    onImage?: (attachment: Attachment) => void;
    signal: AbortSignal;
    /** 保存中の会話のID（使用量の記録に使う。まだなければ null） */
    conversationId?: string | null;
  },
) => Promise<void>;
