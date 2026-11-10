/**
 * チャットの受付窓口。アプリから会話を受け取り、AIの回答を少しずつ返す。
 *
 * 返す形式：1行に1つのJSON（NDJSON）
 *   {"type":"delta","text":"..."}   … 回答の続き
 *   {"type":"done"}                 … 回答の終わり
 *   {"type":"replace","text":"..."} … 安全チェックで回答を差し替える（表示中の回答をこの文に置き換える）
 *   {"type":"error","code":"..."}   … 途中で失敗した
 *
 * 秘密の情報（APIキーやAI会社のエラー本文）はアプリには返さず、ログにだけ出す。
 */
import { type Env, getModel, getModerator, getProvider } from './providers/index.ts';
import { BLOCKED_OUTPUT_CATEGORIES, hasAny, SELF_HARM_CATEGORIES } from './providers/moderation.ts';
import { type ProviderEvent, ProviderError, type ProviderMessage } from './providers/types.ts';
import { buildSystemPrompt, LANGUAGE_NAMES, safeFallback } from './system-prompt.ts';

/** 安全チェックを待つ最大時間（これを過ぎたらチェックなしで進める） */
const MODERATION_TIMEOUT_MS = 3000;

/** 1通のメッセージの最大文字数 */
export const MAX_MESSAGE_CHARS = 8000;
/** 会話全体の最大文字数（長すぎる会話で料金が膨らむのを防ぐ） */
export const MAX_TOTAL_CHARS = 32000;
/** AIに渡す直近のメッセージ数 */
export const MAX_HISTORY = 20;
/** 受け付けるメッセージ数の上限 */
export const MAX_MESSAGES = 200;

export type ErrorCode =
  | 'invalid_request'
  | 'rate_limited'
  | 'service_unavailable'
  | 'upstream_error'
  | 'unauthorized';

type Deps = {
  env: Env;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export function createHandler({ env, fetchImpl, now = Date.now }: Deps) {
  const doFetch = fetchImpl ?? fetch;
  const limiter = createRateLimiter(Number(env.get('RATE_LIMIT_PER_MINUTE') ?? 20), now);

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, env);

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return errorResponse(405, 'invalid_request', cors);

    // ログインしている本人か確かめる（ログインなしではAIを使えない）
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const auth = await authenticate(req, env, doFetch, ip);
    if (auth.kind === 'misconfigured') return errorResponse(503, 'service_unavailable', cors);
    if (auth.kind === 'denied') return errorResponse(401, 'unauthorized', cors);
    const userId = auth.userId;

    // 同じ人から短時間に大量に送られるのを防ぐ（1分あたりの回数）
    if (!limiter.allow(userId)) return errorResponse(429, 'rate_limited', cors);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, 'invalid_request', cors);
    }
    const parsed = validateMessages(body);
    if (!parsed.ok) {
      console.warn(`[chat] invalid request: ${parsed.reason}`);
      return errorResponse(400, 'invalid_request', cors);
    }

    const provider = getProvider(env, fetchImpl);
    const model = getModel(env);
    if (!provider || !model) return errorResponse(503, 'service_unavailable', cors);

    const maxOutputTokens = Number(env.get('MAX_OUTPUT_TOKENS') ?? 1500);

    const upstream = new AbortController();
    req.signal?.addEventListener('abort', () => upstream.abort(), { once: true });

    // 入力の安全チェック：自傷の可能性があれば、カウンターモードを止めて安全モードにする
    const moderator = getModerator(env, fetchImpl);
    const lastUser = parsed.messages[parsed.messages.length - 1].content;
    const inputCheck = moderator
      ? await withTimeout(moderator.check(lastUser, upstream.signal), MODERATION_TIMEOUT_MS)
      : null;
    const selfHarmRisk = hasAny(inputCheck, SELF_HARM_CATEGORIES);
    if (inputCheck?.flagged) {
      console.log(JSON.stringify({ event: 'moderation_input', categories: inputCheck.categories }));
    }

    const messages: ProviderMessage[] = [
      { role: 'system', content: buildSystemPrompt({ selfHarmRisk, ...readLanguages(body) }) },
      ...parsed.messages.slice(-MAX_HISTORY),
    ];

    const events = provider.stream({ model, messages, maxOutputTokens, signal: upstream.signal });

    // 最初の反応を待ってから返事を始める。最初で失敗した場合は、正しいHTTPの番号でエラーを返せる。
    let first: IteratorResult<ProviderEvent>;
    try {
      first = await events.next();
    } catch (e) {
      const { status, code, reason } = classifyError(e);
      return errorResponse(status, code, cors, reason);
    }

    const encoder = new TextEncoder();
    const startedAt = now();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        const usage = { input: null as number | null, output: null as number | null };
        let fullText = '';
        let replaced = false;
        const handleEvent = (ev: ProviderEvent) => {
          if (ev.type === 'delta') {
            fullText += ev.text;
            send({ type: 'delta', text: ev.text });
          } else {
            usage.input = ev.inputTokens;
            usage.output = ev.outputTokens;
          }
        };
        try {
          if (!first.done) handleEvent(first.value);
          for (let r = await events.next(); !r.done; r = await events.next()) handleEvent(r.value);

          // 出力の安全チェック：差別・脅し・性的な内容などが含まれていたら差し替える
          if (moderator && fullText.trim()) {
            const outputCheck = await withTimeout(
              moderator.check(fullText, upstream.signal),
              MODERATION_TIMEOUT_MS,
            );
            // 自傷の相談への回答は、寄り添う内容でも「自傷」の話題として引っかかるため、
            // そのときは自傷の分類では差し替えない（差別・性的な内容などは引き続き差し替える）
            const blocked = selfHarmRisk
              ? BLOCKED_OUTPUT_CATEGORIES.filter((c) => !c.startsWith('self-harm'))
              : BLOCKED_OUTPUT_CATEGORIES;
            if (hasAny(outputCheck, blocked)) {
              replaced = true;
              send({
                type: 'replace',
                text: safeFallback(fullText),
                categories: outputCheck?.categories ?? [],
              });
            }
            if (outputCheck?.flagged) {
              console.log(
                JSON.stringify({
                  event: 'moderation_output',
                  categories: outputCheck.categories,
                  replaced,
                }),
              );
            }
          }
          send({ type: 'done' });
        } catch (e) {
          if (!upstream.signal.aborted) {
            const { code, reason } = classifyError(e);
            send(reason ? { type: 'error', code, reason } : { type: 'error', code });
          }
        } finally {
          // トークン使用量を記録（PHASE 8 でデータベースの usage_events にも保存する）
          console.log(
            JSON.stringify({
              event: 'usage',
              user_id: userId,
              provider: provider.name,
              model,
              input_tokens: usage.input,
              output_tokens: usage.output,
              aborted: upstream.signal.aborted,
              self_harm_risk: selfHarmRisk,
              replaced,
              ms: now() - startedAt,
            }),
          );
          try {
            controller.close();
          } catch {
            // すでに閉じている
          }
        }
      },
      cancel() {
        // アプリ側で停止ボタンが押された・画面を閉じた
        upstream.abort();
      },
    });

    return new Response(stream, {
      headers: {
        ...cors,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  };
}

type AuthResult =
  | { kind: 'ok'; userId: string }
  | { kind: 'denied' }
  | { kind: 'misconfigured' };

/**
 * ログインの鍵（Authorization: Bearer ...）を Supabase に確認してもらい、本人のIDを得る。
 * REQUIRE_AUTH=false のときだけ、ログインなしで使える（テスト・開発用）。
 */
async function authenticate(
  req: Request,
  env: Env,
  doFetch: typeof fetch,
  ip: string,
): Promise<AuthResult> {
  if ((env.get('REQUIRE_AUTH') ?? 'true').toLowerCase() === 'false') {
    return { kind: 'ok', userId: `ip:${ip}` };
  }
  const header = req.headers.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { kind: 'denied' };

  const supabaseUrl = env.get('SUPABASE_URL');
  // アプリが送ってくる公開キー（なければサーバーの環境変数）を使う
  const apikey = req.headers.get('apikey') ?? env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !apikey) {
    console.error('[chat] SUPABASE_URL or apikey is missing; cannot verify users');
    return { kind: 'misconfigured' };
  }
  try {
    const res = await doFetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { kind: 'denied' };
    const user = await res.json();
    return typeof user?.id === 'string' ? { kind: 'ok', userId: user.id } : { kind: 'denied' };
  } catch (e) {
    console.error('[chat] auth check failed', e);
    return { kind: 'misconfigured' };
  }
}

/** アプリから届いた言語設定を読む（対応外の値は無視） */
function readLanguages(body: unknown): { replyLanguage: string | null; uiLanguage: string | null } {
  const s = (body as { settings?: { replyLanguage?: unknown; uiLanguage?: unknown } })?.settings;
  const valid = (v: unknown) => (typeof v === 'string' && v in LANGUAGE_NAMES ? v : null);
  return { replyLanguage: valid(s?.replyLanguage), uiLanguage: valid(s?.uiLanguage) };
}

/** 決めた時間内に終わらなければ null を返す */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

type ValidationResult =
  | { ok: true; messages: { role: 'user' | 'assistant'; content: string }[] }
  | { ok: false; reason: string };

export function validateMessages(body: unknown): ValidationResult {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, reason: 'messages missing' };
  if (list.length > MAX_MESSAGES) return { ok: false, reason: 'too many messages' };

  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of list) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if (role !== 'user' && role !== 'assistant') return { ok: false, reason: 'bad role' };
    if (typeof content !== 'string') return { ok: false, reason: 'bad content' };
    if (content.length > MAX_MESSAGE_CHARS) return { ok: false, reason: 'message too long' };
    if (role === 'user' && content.trim().length === 0) return { ok: false, reason: 'empty message' };
    // 途中で停止した空の回答などは送らない
    if (content.trim().length === 0) continue;
    messages.push({ role, content });
  }
  if (messages[messages.length - 1]?.role !== 'user') return { ok: false, reason: 'last must be user' };

  const recent = messages.slice(-MAX_HISTORY);
  const total = recent.reduce((n, m) => n + m.content.length, 0);
  if (total > MAX_TOTAL_CHARS) return { ok: false, reason: 'conversation too long' };

  return { ok: true, messages };
}

function classifyError(e: unknown): { status: number; code: ErrorCode; reason?: string } {
  if (e instanceof ProviderError) {
    // エラー本文はログにだけ出す（アプリには出さない）。
    // AI会社のエラーの種類名（例：rate_limit_exceeded）だけは、原因調査のために reason として返す。
    console.error(`[chat] provider error ${e.status} ${e.code ?? ''}: ${e.message}`);
    const reason = /^[a-z0-9_]{1,64}$/.test(e.code ?? '') ? e.code : `http_${e.status}`;
    if (e.status === 429 && e.code !== 'insufficient_quota') {
      return { status: 429, code: 'rate_limited', reason };
    }
    if (e.status === 401 || e.status === 403 || e.status === 404 || e.code === 'insufficient_quota') {
      // APIキーの間違い・モデル名の間違い・残高不足 → 運営側の設定の問題
      return { status: 503, code: 'service_unavailable', reason };
    }
    return { status: 502, code: 'upstream_error', reason };
  }
  console.error('[chat] unexpected error', e);
  return { status: 502, code: 'upstream_error' };
}

function errorResponse(
  status: number,
  code: ErrorCode,
  cors: Record<string, string>,
  reason?: string,
) {
  return new Response(JSON.stringify(reason ? { type: 'error', code, reason } : { type: 'error', code }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Webブラウザから呼べるようにするための設定（CORS） */
function corsHeaders(req: Request, env: Env): Record<string, string> {
  const allowed = (env.get('ALLOWED_ORIGINS') ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin') ?? '';
  const allowOrigin = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/** 1分あたりの回数制限（サーバーが再起動すると数え直しになる簡易版） */
function createRateLimiter(perMinute: number, now: () => number) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string) {
      if (!(perMinute > 0)) return true;
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < 60_000);
      if (recent.length >= perMinute) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 10_000) hits.clear();
      return true;
    },
  };
}
