/**
 * 画像生成（「〜の画像を作って」と頼まれたとき、AIが generate_image を呼ぶ）。
 * - OpenAI の画像生成API で作り、Storage（attachments/<ユーザーID>/）に保存する。
 * - 1日（直近24時間）の枚数に上限がある：無料2枚・PLUS 30枚（環境変数で変えられる）。
 * - 作った記録は image_generations に残す（上限の判定と費用の把握のため）。
 */
import type { Env } from '../_shared/auth.ts';
import type { ToolSpec } from './providers/types.ts';

const WINDOW_MS = 24 * 60 * 60 * 1000;
export { DEFAULT_IMAGE_LIMITS, imageLimitFor } from '../_shared/image-limits.ts';

/** AIに渡す道具の説明 */
export const IMAGE_TOOL: ToolSpec = {
  name: 'generate_image',
  description:
    'Create an image for the user. Call this only when the user clearly asks to create, draw, generate or illustrate an image/picture/illustration. Never for real, identifiable people (celebrities, public figures, private persons) or existing copyrighted characters, logos or brands — refuse those in text instead.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'A detailed English description of the image to create (subject, style, composition, lighting, colors). Original content only.',
      },
    },
    required: ['prompt'],
  },
};

type Rest = { base: string; headers: Record<string, string> };
function rest(env: Env): Rest | null {
  const base = env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

/** 直近24時間に作った枚数。調べられなければ null */
export async function imagesUsed(env: Env, doFetch: typeof fetch, userId: string, now: number) {
  const r = rest(env);
  if (!r) return null;
  try {
    const since = new Date(now - WINDOW_MS).toISOString();
    const res = await doFetch(
      `${r.base}/rest/v1/image_generations?select=id&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(since)}&limit=1`,
      { headers: { ...r.headers, Prefer: 'count=exact' }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number((res.headers.get('content-range') ?? '').split('/')[1]);
    await res.body?.cancel();
    return Number.isFinite(total) ? total : 0;
  } catch (e) {
    console.error('[image] usage check failed', e);
    return null;
  }
}

export type ImageResult =
  | { ok: true; path: string; mime: string; width: number; height: number }
  | { ok: false; reason: 'refused' | 'failed' };

const SIZE = '1024x1024';

/** 画像を作って保存する */
export async function generateImage(
  env: Env,
  doFetch: typeof fetch,
  userId: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<ImageResult> {
  const apiKey = env.get('OPENAI_API_KEY');
  const r = rest(env);
  if (!apiKey || !r) return { ok: false, reason: 'failed' };
  const model = env.get('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1';
  // 標準画質：gpt-image 系は medium、dall-e 系は standard
  const quality =
    env.get('OPENAI_IMAGE_QUALITY') ?? (model.startsWith('dall-e') ? 'standard' : 'medium');
  const baseUrl = (env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');

  const res = await doFetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: prompt.slice(0, 3000),
      size: SIZE,
      quality,
      n: 1,
      ...(model.startsWith('dall-e') ? { response_format: 'b64_json' } : {}),
    }),
    signal: signal ?? AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    let code = '';
    try {
      const data = await res.json();
      code = `${data?.error?.code ?? ''} ${data?.error?.type ?? ''} ${data?.error?.message ?? ''}`;
    } catch {
      // JSONでない
    }
    console.error(`[image] OpenAI ${res.status} ${code.slice(0, 300)}`);
    // 安全ルールで断られた
    if (res.status === 400 && /moderation|safety|content_policy|policy/i.test(code)) {
      return { ok: false, reason: 'refused' };
    }
    return { ok: false, reason: 'failed' };
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json as string | undefined;
  let bytes: Uint8Array;
  if (b64) {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else if (typeof data?.data?.[0]?.url === 'string') {
    const img = await doFetch(data.data[0].url, { signal: AbortSignal.timeout(30000) });
    if (!img.ok) return { ok: false, reason: 'failed' };
    bytes = new Uint8Array(await img.arrayBuffer());
  } else {
    return { ok: false, reason: 'failed' };
  }

  const path = `${userId}/${crypto.randomUUID()}.png`;
  const up = await doFetch(`${r.base}/storage/v1/object/attachments/${path}`, {
    method: 'POST',
    headers: { ...r.headers, 'Content-Type': 'image/png' },
    body: bytes,
    signal: AbortSignal.timeout(30000),
  });
  if (!up.ok) {
    console.error(`[image] upload failed: HTTP ${up.status}`);
    return { ok: false, reason: 'failed' };
  }
  const rec = await doFetch(`${r.base}/rest/v1/image_generations`, {
    method: 'POST',
    headers: { ...r.headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, path, model, quality, size: SIZE }),
    signal: AbortSignal.timeout(5000),
  });
  if (!rec.ok) console.error(`[image] record failed: HTTP ${rec.status}`);
  console.log(JSON.stringify({ event: 'image_generated', user_id: userId, model, quality }));
  return { ok: true, path, mime: 'image/png', width: 1024, height: 1024 };
}
