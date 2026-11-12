import { createOpenAIModerator, type Moderator } from './moderation.ts';
import { createOpenAIProvider } from './openai.ts';
import { createOpenAIResponsesProvider } from './openai-responses.ts';
import type { AIProvider } from './types.ts';

export type Env = { get(name: string): string | undefined };

/**
 * 環境変数 AI_PROVIDER で使う会社を選ぶ（今は "openai" のみ）。
 * Anthropic などを足すときは、ここに分岐を1つ追加する。
 * 設定が足りないときは null を返す（理由はログに出す）。
 */
export function getProvider(env: Env, fetchImpl?: typeof fetch): AIProvider | null {
  const name = (env.get('AI_PROVIDER') ?? 'openai').toLowerCase();
  switch (name) {
    case 'openai': {
      const apiKey = env.get('OPENAI_API_KEY');
      if (!apiKey) {
        console.error('[chat] OPENAI_API_KEY is not set');
        return null;
      }
      // OPENAI_API=chat で、以前の Chat Completions に戻せる（ウェブ検索は使えなくなる）
      const options = { apiKey, baseUrl: env.get('OPENAI_BASE_URL'), fetchImpl };
      return (env.get('OPENAI_API') ?? 'responses').toLowerCase() === 'chat'
        ? createOpenAIProvider(options)
        : createOpenAIResponsesProvider(options);
    }
    default:
      console.error(`[chat] Unknown AI_PROVIDER: ${name}`);
      return null;
  }
}

/**
 * 安全チェック（Moderation）。OpenAIのキーがあれば使う。
 * MODERATION=off で止められる（テスト用）。
 */
export function getModerator(env: Env, fetchImpl?: typeof fetch): Moderator | null {
  if ((env.get('MODERATION') ?? 'on').toLowerCase() === 'off') return null;
  const apiKey = env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  return createOpenAIModerator({
    apiKey,
    model: env.get('OPENAI_MODERATION_MODEL'),
    baseUrl: env.get('OPENAI_BASE_URL'),
    fetchImpl,
  });
}

/** 使うモデル名。プロバイダーごとの環境変数から読む */
export function getModel(env: Env): string | null {
  const name = (env.get('AI_PROVIDER') ?? 'openai').toLowerCase();
  const model = name === 'openai' ? env.get('OPENAI_MODEL') : undefined;
  if (!model) console.error(`[chat] Model is not set for provider ${name} (e.g. OPENAI_MODEL)`);
  return model ?? null;
}
