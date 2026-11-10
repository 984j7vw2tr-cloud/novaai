/**
 * AIプロバイダー（OpenAI・Anthropicなど）の共通の形。
 * 新しい会社のモデルを使いたくなったら、この形に合わせたファイルを1つ足すだけで切り替えられる。
 */

export type ProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ProviderEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

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
