/**
 * 声で入力（マイクボタン）：録音した音声を文字にして返す。
 *
 * POST /functions/v1/transcribe
 *   本文：音声ファイルそのもの（Content-Type: audio/webm, audio/mp4, audio/m4a など）
 *   返事：{"text":"文字になった内容"}
 * - ログインした本人だけ使える。1分あたりの回数と、音声の大きさに上限がある。
 * - 音声は文字にしたらすぐ捨てる（保存しない）。
 */
import { authenticate, type Env } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/http.ts';

/** 音声の最大サイズ（約2〜3分ぶん） */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/3gpp': 'm4a',
};

type Deps = { env: Env; fetchImpl?: typeof fetch; now?: () => number };

export function createTranscribeHandler({ env, fetchImpl, now = Date.now }: Deps) {
  const doFetch = fetchImpl ?? fetch;
  const perMinute = Number(env.get('TRANSCRIBE_LIMIT_PER_MINUTE') ?? 10);
  const hits = new Map<string, number[]>();

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, env);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json(405, { type: 'error', code: 'invalid_request' });

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const auth = await authenticate(req, env, doFetch, ip);
    if (auth.kind === 'misconfigured')
      return json(503, { type: 'error', code: 'service_unavailable' });
    if (auth.kind === 'denied') return json(401, { type: 'error', code: 'unauthorized' });

    // 1分あたりの回数制限
    const t = now();
    const recent = (hits.get(auth.userId) ?? []).filter((x) => t - x < 60_000);
    if (perMinute > 0 && recent.length >= perMinute) {
      return json(429, { type: 'error', code: 'rate_limited' });
    }
    recent.push(t);
    hits.set(auth.userId, recent);
    if (hits.size > 10_000) hits.clear();

    const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = EXT[mime];
    if (!ext)
      return json(400, { type: 'error', code: 'invalid_request', reason: 'unsupported_audio' });

    const audio = new Uint8Array(await req.arrayBuffer());
    if (audio.byteLength === 0) return json(400, { type: 'error', code: 'invalid_request' });
    if (audio.byteLength > MAX_AUDIO_BYTES) {
      return json(413, { type: 'error', code: 'invalid_request', reason: 'too_large' });
    }

    const apiKey = env.get('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('[transcribe] OPENAI_API_KEY is not set');
      return json(503, { type: 'error', code: 'service_unavailable' });
    }
    const model = env.get('OPENAI_TRANSCRIBE_MODEL') ?? 'gpt-4o-mini-transcribe';
    const baseUrl = (env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');

    const form = new FormData();
    form.append('file', new Blob([audio], { type: mime }), `voice.${ext}`);
    form.append('model', model);
    form.append('response_format', 'json');

    try {
      const res = await doFetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        let detail = '';
        try {
          const data = await res.json();
          detail = `${data?.error?.code ?? data?.error?.type ?? ''}: ${data?.error?.message ?? ''}`;
        } catch {
          // JSONでない
        }
        console.error(`[transcribe] OpenAI ${res.status} ${detail}`);
        const code =
          res.status === 429
            ? 'rate_limited'
            : res.status >= 500
              ? 'upstream_error'
              : 'service_unavailable';
        return json(res.status === 429 ? 429 : 502, {
          type: 'error',
          code,
          reason: `http_${res.status}`,
        });
      }
      const data = await res.json();
      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      console.log(
        JSON.stringify({
          event: 'transcribe',
          user_id: auth.userId,
          model,
          bytes: audio.byteLength,
          chars: text.length,
        }),
      );
      return json(200, { text });
    } catch (e) {
      console.error('[transcribe] error', e);
      return json(502, { type: 'error', code: 'upstream_error' });
    }
  };
}
