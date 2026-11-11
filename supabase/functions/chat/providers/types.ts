/**
 * AIプロバイダー（OpenAI・Anthropicなど）の共通の形。
 * 新しい会社のモデルを使いたくなったら、この形に合わせたファイルを1つ足すだけで切り替えられる。
 */

/** 発言の中身の部品（文章・画像・ファイル）。OpenAI の Chat Completions と同じ形 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export type ProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  /** 文章だけなら文字列、写真やファイルが付いていれば部品の一覧 */
  content: string | ContentPart[];
};

export type ProviderEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedInputTokens: number };

export type ProviderRequest = {
  model: string;
  messages: ProviderMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
};

export interface AIProvider {
  readonly name: string;
  /** 回答を少しずつ返す（ストリーミング） */
  stream(request: ProviderRequest): AsyncGenerator<ProviderEvent>;
}

/** AI会社のAPIがエラーを返したとき。status はHTTPの番号、code は会社側のエラー名 */
export class ProviderError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
  }
}
