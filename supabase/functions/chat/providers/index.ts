import { createOpenAIProvider } from './openai.ts';
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
      return createOpenAIProvider({ apiKey, baseUrl: env.get('OPENAI_BASE_URL'), fetchImpl });
    }
    default:
      console.error(`[chat] Unknown AI_PROVIDER: ${name}`);
      return null;
  }
}

/** 使うモデル名。プロバイダーごとの環境変数から読む */
export function getModel(env: Env): string | null {
  const name = (env.get('AI_PROVIDER') ?? 'openai').toLowerCase();
  const model = name === 'openai' ? env.get('OPENAI_MODEL') : undefined;
  if (!model) console.error(`[chat] Model is not set for provider ${name} (e.g. OPENAI_MODEL)`);
  return model ?? null;
}
