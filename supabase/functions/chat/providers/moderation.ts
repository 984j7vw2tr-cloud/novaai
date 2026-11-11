/**
 * 文章が危険かどうかの自動チェック（OpenAI Moderation API。無料）。
 * - 入力：自傷の可能性 → カウンターモードを止めて安全モードにする
 * - 出力：差別・脅し・性的な内容など → 安全な文に差し替える
 * チェック自体が失敗したときは null を返し、チャットは止めない（ログに残す）。
 */

export type ModerationResult = {
  flagged: boolean;
  /** 引っかかった種類（例："self-harm/intent", "hate"） */
  categories: string[];
};

/** チェックするもの：文章だけ、または文章＋画像（omni-moderation は画像も見られる） */
export type ModerationInput =
  | string
  | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

export interface Moderator {
  check(input: ModerationInput, signal?: AbortSignal): Promise<ModerationResult | null>;
}

export function createOpenAIModerator(options: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Moderator {
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const model = options.model ?? 'omni-moderation-latest';

  return {
    async check(input, signal) {
      try {
        const res = await doFetch(`${baseUrl}/moderations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, input }),
          signal,
        });
        if (!res.ok) {
          console.error(`[chat] moderation failed: HTTP ${res.status}`);
          return null;
        }
        const data = await res.json();
        const result = data?.results?.[0];
        if (!result || typeof result.categories !== 'object') return null;
        const categories = Object.entries(result.categories as Record<string, boolean>)
          .filter(([, v]) => v === true)
          .map(([k]) => k);
        return { flagged: Boolean(result.flagged), categories };
      } catch (e) {
        if (!signal?.aborted) console.error('[chat] moderation error', e);
        return null;
      }
    },
  };
}

/** 入力がこれに当てはまったら、安全モード（カウンターモード停止）にする */
export const SELF_HARM_CATEGORIES = ['self-harm', 'self-harm/intent', 'self-harm/instructions'];

/**
 * 出力がこれに当てはまったら差し替える（Karakuchiが絶対に言ってはいけない内容だけ）。
 * - ただの "harassment"（軽い悪口）はカウンターモードで普通に出るので対象にしない。
 * - "self-harm" "violence" などは対象にしない。「死にたい」への寄り添いや、
 *   暴力を止める回答も、話題として引っかかってしまうため（実際に誤って差し替えられた）。
 */
export const BLOCKED_OUTPUT_CATEGORIES = [
  'hate',
  'hate/threatening',
  'harassment/threatening',
  'sexual',
  'sexual/minors',
  'self-harm/instructions',
];

export const hasAny = (r: ModerationResult | null, list: string[]) =>
  Boolean(r && r.categories.some((c) => list.includes(c)));
