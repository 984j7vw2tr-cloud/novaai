/**
 * AIプロバイダー（OpenAI・Anthropicなど）の共通の形。
 * 新しい会社のモデルを使いたくなったら、この形に合わせたファイルを1つ足すだけで切り替えられる。
 */

/** 発言の中身の部品（文章・画像・ファイル）。OpenAI の Chat Completions と同じ形 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

/** AIが呼び出した道具（例：画像を作る） */
export type ToolCall = { id: string; name: string; arguments: string };

export type ProviderMessage =
  | {
      role: 'system' | 'user' | 'assistant';
      /** 文章だけなら文字列、写真やファイルが付いていれば部品の一覧 */
      content: string | ContentPart[];
    }
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/** AIに渡す道具の説明（OpenAI の function calling の形） */
export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ProviderEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  /** ウェブ検索を始めた */
  | { type: 'status'; status: 'searching' }
  /** ウェブ検索が1回終わった */
  | { type: 'search_done' }
  /** 回答の情報元（ウェブ検索の結果） */
  | { type: 'source'; url: string; title: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedInputTokens: number };

export type ProviderRequest = {
  model: string;
  messages: ProviderMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
  /** AIが使える道具（なければ文章だけ） */
  tools?: ToolSpec[];
  /** 考える深さ（道具を使うときは 'none' が必要なモデルがある） */
  reasoningEffort?: string;
  /** ウェブ検索を使えるようにする（対応しているプロバイダーだけ） */
  webSearch?: boolean;
};

export interface AIProvider {
  readonly name: string;
  /** 「深く考える」のまま道具を使えるか（Chat Completions の一部のモデルは不可） */
  readonly toolsWithReasoning?: boolean;
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
