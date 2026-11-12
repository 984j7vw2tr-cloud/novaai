/**
 * 音声会話（リアルタイム）：OpenAI Realtime API に、アプリが直接つなぐための「使い捨ての鍵」を渡す。
 *
 * POST /functions/v1/voice
 *   {"action":"start","settings":{"replyLanguage":"ja","uiLanguage":"ja"}}
 *     → {"clientSecret":"ek_...","model":"...","sessionId":"...","remainingSeconds":180,"limitSeconds":180,"plan":"free"}
 *     上限に達していれば 429 {"code":"voice_limit", ...}
 *   {"action":"tick","sessionId":"...","seconds":40}   通話中の途中経過（約20秒ごと）
 *   {"action":"end","sessionId":"...","seconds":95}    終了
 *     → {"ok":true}（話した時間を記録）
 *
 * - 本物の鍵（OPENAI_API_KEY）はサーバーから出さない。アプリには1分で切れる使い捨ての鍵だけ渡す。
 * - 1日（直近24時間）に話せる時間：無料3分・PLUS 30分（voice-limits.ts）。
 *   通話中は約20秒ごとに途中経過が届く。終了の連絡が来なかった通話は、最後の途中経過＋30秒で数える。
 * - NAYQOの人格（指示文）はチャットと同じものに、声で話すためのルールを足して使う。
 */
import { authenticate, type Env, UUID_RE } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/http.ts';
import { getActivePlan } from '../_shared/active-plan.ts';
import { voiceMinutesFor } from '../_shared/voice-limits.ts';
import { buildSystemPrompt, LANGUAGE_NAMES } from '../_shared/system-prompt.ts';

const WINDOW_MS = 24 * 60 * 60 * 1000;
/** これより残りが少なければ、新しい通話は始めない */
export const MIN_START_SECONDS = 10;

type Deps = { env: Env; fetchImpl?: typeof fetch; now?: () => number };

type SessionRow = {
  id?: string;
  allowed_seconds: number;
  started_at: string;
  ended_at: string | null;
  seconds: number | null;
};

/** 途中経過の連絡（tick）の間隔の目安と、連絡が途切れたときに足す秒数 */
export const TICK_GRACE_SECONDS = 30;

/**
 * 1つの通話で使った秒数（どれも、その通話で話せる最大の秒数まで）
 * - 終了の連絡あり：申告された秒数
 * - 通話中（または連絡が途切れた）：最後に届いた秒数＋少し（経過時間まで）
 * - 一度も連絡がない：経過時間（最大60秒）
 *   ※ブラウザが突然閉じても、残り時間を丸ごと失わないようにするため
 */
export function secondsUsed(row: SessionRow, now: number): number {
  const elapsed = Math.max(0, (now - Date.parse(row.started_at)) / 1000);
  let s: number;
  if (row.ended_at) s = row.seconds ?? Math.min(elapsed, 60);
  else if (row.seconds !== null) s = Math.min(elapsed, row.seconds + TICK_GRACE_SECONDS);
  else s = Math.min(elapsed, 60);
  return Math.min(row.allowed_seconds, Math.max(0, s));
}

export function createVoiceHandler({ env, fetchImpl, now = Date.now }: Deps) {
  const doFetch = fetchImpl ?? fetch;
  const perMinute = Number(env.get('VOICE_STARTS_PER_MINUTE') ?? 6);
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
    const userId = auth.userId;
    if (!UUID_RE.test(userId)) return json(401, { type: 'error', code: 'unauthorized' });

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json(400, { type: 'error', code: 'invalid_request' });
    }

    const base = env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
    const apiKey = env.get('OPENAI_API_KEY');
    if (!base || !key || !apiKey) {
      console.error('[voice] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY missing');
      return json(503, { type: 'error', code: 'service_unavailable' });
    }
    const db = { apikey: key, Authorization: `Bearer ${key}` };
    const t = now();

    // ---- 通話の途中経過（tick）・終了（end）：話した時間を記録 ----
    if (body.action === 'end' || body.action === 'tick') {
      const ending = body.action === 'end';
      const id = String(body.sessionId ?? '');
      const seconds = Number(body.seconds);
      if (!UUID_RE.test(id) || !Number.isFinite(seconds) || seconds < 0) {
        return json(400, { type: 'error', code: 'invalid_request' });
      }
      const res = await doFetch(
        `${base}/rest/v1/voice_sessions?select=allowed_seconds,started_at,ended_at,seconds&id=eq.${id}&user_id=eq.${userId}&limit=1`,
        { headers: db, signal: AbortSignal.timeout(5000) },
      );
      const row = res.ok ? ((await res.json()) as SessionRow[])[0] : undefined;
      if (!row) return json(404, { type: 'error', code: 'not_found' });
      if (row.ended_at) return json(200, { ok: true });
      // 申告された秒数は、始めてからの経過時間（＋少しの余裕）と、その通話の残り時間までにする
      const elapsed = Math.max(0, (t - Date.parse(row.started_at)) / 1000);
      const recorded = Math.round(Math.min(seconds, elapsed + 5, row.allowed_seconds));
      await doFetch(`${base}/rest/v1/voice_sessions?id=eq.${id}&user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: { ...db, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(
          ending
            ? { ended_at: new Date(t).toISOString(), seconds: recorded }
            : { seconds: recorded },
        ),
        signal: AbortSignal.timeout(5000),
      });
      if (ending) {
        console.log(JSON.stringify({ event: 'voice_end', user_id: userId, seconds: recorded }));
      }
      return json(200, { ok: true });
    }

    if (body.action !== 'start') return json(400, { type: 'error', code: 'invalid_request' });

    // 何度も始め直されるのを防ぐ（1分あたりの回数）
    const recentHits = (hits.get(userId) ?? []).filter((x) => t - x < 60_000);
    if (perMinute > 0 && recentHits.length >= perMinute) {
      return json(429, { type: 'error', code: 'rate_limited' });
    }
    recentHits.push(t);
    hits.set(userId, recentHits);
    if (hits.size > 10_000) hits.clear();

    // ---- 通話の開始：プランと今日の残り時間を調べる ----
    const plan = await getActivePlan(env, doFetch, userId, t);
    if (!plan) return json(503, { type: 'error', code: 'service_unavailable' });
    const limitSeconds = Math.round(voiceMinutesFor(plan, env) * 60);
    const since = new Date(t - WINDOW_MS).toISOString();
    const listRes = await doFetch(
      `${base}/rest/v1/voice_sessions?select=allowed_seconds,started_at,ended_at,seconds` +
        `&user_id=eq.${userId}&started_at=gte.${encodeURIComponent(since)}&order=started_at.asc&limit=500`,
      { headers: db, signal: AbortSignal.timeout(5000) },
    );
    if (!listRes.ok) return json(503, { type: 'error', code: 'service_unavailable' });
    const rows = (await listRes.json()) as SessionRow[];
    const used = rows.reduce((sum, r) => sum + secondsUsed(r, t), 0);
    const remainingSeconds = Math.floor(limitSeconds - used);
    if (remainingSeconds < MIN_START_SECONDS) {
      const oldest = rows[0]?.started_at;
      return json(429, {
        type: 'error',
        code: 'voice_limit',
        plan,
        limitSeconds,
        resetAt: oldest ? new Date(Date.parse(oldest) + WINDOW_MS).toISOString() : null,
      });
    }

    // ---- OpenAI から使い捨ての鍵をもらう ----
    const s = body.settings as { replyLanguage?: unknown; uiLanguage?: unknown } | undefined;
    const lang = (v: unknown) => (typeof v === 'string' && v in LANGUAGE_NAMES ? v : null);
    const model = env.get('OPENAI_REALTIME_MODEL') ?? 'gpt-realtime-2.1-mini';
    const voice = env.get('OPENAI_REALTIME_VOICE') ?? 'cedar';
    const instructions = buildSystemPrompt({
      selfHarmRisk: false,
      replyLanguage: lang(s?.replyLanguage),
      uiLanguage: lang(s?.uiLanguage),
      voice: true,
      today: new Date(t).toISOString().slice(0, 10),
    });
    const baseUrl = (env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const secretRes = await doFetch(`${baseUrl}/realtime/client_secrets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 60 },
        session: {
          type: 'realtime',
          model,
          instructions,
          output_modalities: ['audio'],
          max_output_tokens: Number(env.get('VOICE_MAX_OUTPUT_TOKENS') ?? 1024),
          audio: {
            input: {
              transcription: {
                model: env.get('OPENAI_TRANSCRIBE_MODEL') ?? 'gpt-4o-mini-transcribe',
              },
              turn_detection: { type: 'semantic_vad' },
              noise_reduction: { type: 'near_field' },
            },
            output: { voice },
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const secret = (await secretRes.json().catch(() => ({}))) as {
      value?: string;
      expires_at?: number;
      error?: { message?: string };
    };
    if (!secretRes.ok || !secret.value) {
      console.error(
        `[voice] client_secrets failed: HTTP ${secretRes.status} ${secret.error?.message ?? ''}`,
      );
      return json(502, { type: 'error', code: 'upstream_error' });
    }

    // 通話を記録（この通話で話せる最大の秒数＝今の残り時間）
    const insRes = await doFetch(`${base}/rest/v1/voice_sessions?select=id`, {
      method: 'POST',
      headers: { ...db, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, model, allowed_seconds: remainingSeconds }),
      signal: AbortSignal.timeout(5000),
    });
    const sessionId = insRes.ok ? ((await insRes.json()) as { id: string }[])[0]?.id : undefined;
    if (!sessionId) {
      console.error(`[voice] record failed: HTTP ${insRes.status}`);
      return json(503, { type: 'error', code: 'service_unavailable' });
    }
    console.log(
      JSON.stringify({ event: 'voice_start', user_id: userId, plan, model, remainingSeconds }),
    );
    return json(200, {
      clientSecret: secret.value,
      expiresAt: secret.expires_at ?? null,
      model,
      sessionId,
      remainingSeconds,
      limitSeconds,
      plan,
    });
  };
}
