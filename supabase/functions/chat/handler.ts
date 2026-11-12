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
import { authenticate, UUID_RE } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/http.ts';
import { type Env, getModel, getModerator, getProvider } from './providers/index.ts';
import {
  ATTACHMENT_MESSAGES_WITH_CONTENT,
  type Attachment,
  AttachmentError,
  attachmentNote,
  attachmentPart,
  downloadAttachment,
  ownsAll,
  parseAttachments,
} from './attachments.ts';
import { recentAttachmentPaths, recordAttachmentPaths } from '../_shared/attachment-uses.ts';
import { attachmentLimitFor, type Plan } from '../_shared/plans.ts';
import { getQuotaStatus } from './quota.ts';
import { BLOCKED_OUTPUT_CATEGORIES, hasAny, SELF_HARM_CATEGORIES } from './providers/moderation.ts';
import type { ModerationInput } from './providers/moderation.ts';
import {
  type ContentPart,
  type ProviderEvent,
  ProviderError,
  type ProviderMessage,
  type ToolCall,
} from './providers/types.ts';
import { imageLimitFor } from '../_shared/image-limits.ts';
import { generateImage, IMAGE_TOOL, imagesUsed } from './images.ts';
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
  | 'unauthorized'
  | 'quota_exceeded'
  | 'attachment_limit';

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

    // プランごとの1日（直近24時間）の回数制限
    const quota = UUID_RE.test(userId) ? await getQuotaStatus(env, doFetch, userId, now()) : null;
    if (quota && quota.used >= quota.limit) {
      return errorResponse(429, 'quota_exceeded', cors, undefined, {
        plan: quota.plan,
        limit: quota.limit,
        resetAt: quota.resetAt,
      });
    }

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

    // 添付は本人のフォルダのファイルだけ（ログインなしのテストモードでは添付を使えない）
    const allAttachments = parsed.messages.flatMap((m) => m.attachments);
    if (allAttachments.length && (!UUID_RE.test(userId) || !ownsAll(allAttachments, userId))) {
      console.warn('[chat] invalid request: attachment not owned by user');
      return errorResponse(400, 'invalid_request', cors);
    }

    // 写真・ファイルの1日の上限（無料プランは3回まで）。今回の発言で新しく付けたものだけ数える
    const newPaths = parsed.messages[parsed.messages.length - 1].attachments.map((a) => a.path);
    if (newPaths.length && quota) {
      const attachLimit = attachmentLimitFor(quota.plan, env);
      const recent = await recentAttachmentPaths(env, doFetch, userId, now());
      if (recent) {
        const fresh = newPaths.filter((p) => !recent.includes(p));
        if (Number.isFinite(attachLimit) && recent.length + fresh.length > attachLimit) {
          return errorResponse(429, 'attachment_limit', cors, undefined, {
            limit: attachLimit,
            used: recent.length,
          });
        }
        await recordAttachmentPaths(env, doFetch, userId, fresh);
      }
    }

    const provider = getProvider(env, fetchImpl);
    const model = getModel(env);
    if (!provider || !model) return errorResponse(503, 'service_unavailable', cors);

    const maxOutputTokens = Number(env.get('MAX_OUTPUT_TOKENS') ?? 1500);

    const upstream = new AbortController();
    req.signal?.addEventListener('abort', () => upstream.abort(), { once: true });

    // 直近の会話をAIに渡す形にする（写真・ファイルは Storage から取り出す）
    let recent: ProviderMessage[];
    try {
      recent = await toProviderMessages(parsed.messages.slice(-MAX_HISTORY), (path) =>
        downloadAttachment(env, doFetch, path, upstream.signal),
      );
    } catch (e) {
      const reason = e instanceof AttachmentError ? e.reason : 'attachment_error';
      console.warn(`[chat] attachment failed: ${reason}`);
      return errorResponse(400, 'invalid_request', cors, 'attachment_unavailable');
    }

    // 入力の安全チェック：自傷の可能性があれば、カウンターモードを止めて安全モードにする
    // （写真が付いていれば、1枚目の写真も一緒に見る）
    const moderator = getModerator(env, fetchImpl);
    const inputCheck = moderator
      ? await withTimeout(
          moderator.check(moderationInput(recent[recent.length - 1]), upstream.signal),
          MODERATION_TIMEOUT_MS,
        )
      : null;
    const selfHarmRisk = hasAny(inputCheck, SELF_HARM_CATEGORIES);
    if (inputCheck?.flagged) {
      console.log(JSON.stringify({ event: 'moderation_input', categories: inputCheck.categories }));
    }

    const messages: ProviderMessage[] = [
      { role: 'system', content: buildSystemPrompt({ selfHarmRisk, ...readLanguages(body) }) },
      ...recent,
    ];

    /**
     * 画像生成の道具が呼ばれたときの処理。結果（AIへの報告文）を返す。
     * 作れたら {"type":"image", ...} をアプリに送る（回答の下に画像として表示される）。
     */
    const handleImageCall = async (
      call: ToolCall,
      plan: Plan,
      send: (obj: unknown) => void,
    ): Promise<string> => {
      let prompt = '';
      try {
        prompt = String(JSON.parse(call.arguments || '{}').prompt ?? '').trim();
      } catch {
        // 形がおかしい
      }
      if (!prompt) return 'FAILED: no prompt. Ask the user what image they want.';
      if (!UUID_RE.test(userId)) return 'FAILED: image creation is not available in this mode.';
      const limit = imageLimitFor(plan, env);
      const used = await imagesUsed(env, doFetch, userId, now());
      if (used !== null && used >= limit) {
        return plan === 'free'
          ? `LIMIT_REACHED: the free plan allows ${limit} images per day and the user has used them all. Tell them in your voice, and that PLUS allows ${imageLimitFor('plus', env)} images per day (they can upgrade from the PLUS/upgrade button at the top).`
          : `LIMIT_REACHED: the user's plan allows ${limit} images per day and they have used them all. Tell them to come back tomorrow.`;
      }
      send({ type: 'status', status: 'generating_image' });
      const img = await generateImage(env, doFetch, userId, prompt, upstream.signal);
      if (!img.ok) {
        return img.reason === 'refused'
          ? 'REFUSED: the image was blocked by the safety policy (e.g. a real person, a copyrighted character, sexual or violent content). Refuse confidently in your voice and suggest an original alternative. Do not apologize.'
          : 'FAILED: the image could not be created because of a temporary error. Tell the user to try again in a moment. Do not apologize.';
      }
      send({
        type: 'image',
        attachment: {
          kind: 'image',
          path: img.path,
          name: 'nayqo-image.png',
          mime: img.mime,
          width: img.width,
          height: img.height,
        },
      });
      return 'SUCCESS: the image was created and is shown to the user right below your message. Reply with one short, confident line in your voice (no description of the process, no markdown image links).';
    };

    // 画像を頼んでいそうなときだけ、画像の道具を渡す。
    // （このモデルは道具を使うとき「深く考える」を切る必要があるため、普通の会話の質は落とさない）
    const lastText = parsed.messages[parsed.messages.length - 1].content;
    const offerImageTool = !selfHarmRisk && looksLikeImageRequest(lastText);
    const toolOptions = offerImageTool
      ? { tools: [IMAGE_TOOL], reasoningEffort: env.get('IMAGE_TOOL_REASONING') ?? 'none' }
      : {};

    const events = provider.stream({
      model,
      messages,
      maxOutputTokens,
      signal: upstream.signal,
      ...toolOptions,
    });

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
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        const usage = {
          input: null as number | null,
          output: null as number | null,
          cached: 0,
        };
        // 最初に、今日の残り回数を知らせる（アプリに「残り○回」を出すため）
        if (quota && Number.isFinite(quota.limit)) {
          send({
            type: 'quota',
            plan: quota.plan,
            limit: quota.limit,
            remaining: Math.max(0, quota.limit - quota.used - 1),
          });
        }
        let fullText = '';
        let replaced = false;
        const toolCalls: ToolCall[] = [];
        const handleEvent = (ev: ProviderEvent) => {
          if (ev.type === 'delta') {
            fullText += ev.text;
            send({ type: 'delta', text: ev.text });
          } else if (ev.type === 'tool_call') {
            toolCalls.push(ev.call);
          } else {
            // 2回目の呼び出し（画像を作ったあとのひと言）もあるので、足していく
            usage.input = (usage.input ?? 0) + ev.inputTokens;
            usage.output = (usage.output ?? 0) + ev.outputTokens;
            usage.cached += ev.cachedInputTokens;
          }
        };
        try {
          if (!first.done) handleEvent(first.value);
          for (let r = await events.next(); !r.done; r = await events.next()) handleEvent(r.value);

          // 画像を作ってと頼まれた（AIが generate_image を呼んだ）
          const imageCall = toolCalls.find((c) => c.name === IMAGE_TOOL.name);
          if (imageCall) {
            const result = await handleImageCall(imageCall, quota?.plan ?? 'free', send);
            const follow = provider.stream({
              model,
              messages: [
                ...messages,
                { role: 'assistant', content: fullText || null, tool_calls: [imageCall] },
                { role: 'tool', tool_call_id: imageCall.id, content: result },
              ],
              maxOutputTokens,
              signal: upstream.signal,
              reasoningEffort: toolOptions.reasoningEffort,
            });
            for (let r = await follow.next(); !r.done; r = await follow.next()) {
              if (r.value.type !== 'tool_call') handleEvent(r.value);
            }
          }

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
          // トークン使用量を記録（ログ＋データベースの usage_events）
          await recordUsage(env, doFetch, {
            userId,
            conversationId: readConversationId(body),
            model,
            inputTokens: usage.input ?? 0,
            outputTokens: usage.output ?? 0,
            cachedInputTokens: usage.cached,
            aborted: upstream.signal.aborted,
          });
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

/** アプリから届いた会話ID（使用量をどの会話のものか記録するため）。形がおかしければ無視 */
function readConversationId(body: unknown): string | null {
  const id = (body as { conversationId?: unknown })?.conversationId;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

/**
 * 使用量をデータベース（usage_events）に保存する。
 * 利用者がごまかせないよう、サーバー専用の鍵（SUPABASE_SERVICE_ROLE_KEY。Supabaseが自動で用意）で書く。
 * 保存に失敗しても、チャット自体は止めない（ログに残す）。
 */
async function recordUsage(
  env: Env,
  doFetch: typeof fetch,
  u: {
    userId: string;
    conversationId: string | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    aborted: boolean;
  },
) {
  // ログインなしのテスト用モード（ip:...）は、データベースの利用者ではないので保存しない
  if (!UUID_RE.test(u.userId)) return;
  const supabaseUrl = env.get('SUPABASE_URL');
  const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('[chat] cannot record usage: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return;
  }
  const insert = (conversationId: string | null) =>
    doFetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/usage_events`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: u.userId,
        conversation_id: conversationId,
        model: u.model,
        input_tokens: Math.max(0, Math.round(u.inputTokens)),
        output_tokens: Math.max(0, Math.round(u.outputTokens)),
        cached_input_tokens: Math.max(0, Math.round(u.cachedInputTokens)),
        aborted: u.aborted,
      }),
      signal: AbortSignal.timeout(5000),
    });
  try {
    let res = await insert(u.conversationId);
    // 会話IDが存在しない（まだ作られていない・消された）ときは、会話なしで記録する
    if (!res.ok && u.conversationId && (res.status === 409 || res.status === 400)) {
      res = await insert(null);
    }
    if (!res.ok) console.error(`[chat] usage insert failed: HTTP ${res.status}`);
  } catch (e) {
    console.error('[chat] usage insert error', e);
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

export type ValidMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments: Attachment[];
};

type ValidationResult = { ok: true; messages: ValidMessage[] } | { ok: false; reason: string };

export function validateMessages(body: unknown): ValidationResult {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, reason: 'messages missing' };
  if (list.length > MAX_MESSAGES) return { ok: false, reason: 'too many messages' };

  const messages: ValidMessage[] = [];
  for (const m of list) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if (role !== 'user' && role !== 'assistant') return { ok: false, reason: 'bad role' };
    if (typeof content !== 'string') return { ok: false, reason: 'bad content' };
    if (content.length > MAX_MESSAGE_CHARS) return { ok: false, reason: 'message too long' };
    const attachments = parseAttachments((m as { attachments?: unknown })?.attachments);
    if (!attachments) return { ok: false, reason: 'bad attachments' };
    // AIの発言に付くのは、AIが作った画像だけ
    if (role === 'assistant' && attachments.some((a) => a.kind !== 'image')) {
      return { ok: false, reason: 'bad attachments' };
    }
    // 写真だけ・ファイルだけの発言はOK（文章なしでも送れる）
    if (role === 'user' && content.trim().length === 0 && attachments.length === 0) {
      return { ok: false, reason: 'empty message' };
    }
    // 途中で停止した空の回答などは送らない
    if (content.trim().length === 0 && attachments.length === 0) continue;
    messages.push({ role, content, attachments });
  }
  if (messages[messages.length - 1]?.role !== 'user')
    return { ok: false, reason: 'last must be user' };

  const recent = messages.slice(-MAX_HISTORY);
  const total = recent.reduce((n, m) => n + m.content.length, 0);
  if (total > MAX_TOTAL_CHARS) return { ok: false, reason: 'conversation too long' };

  return { ok: true, messages };
}

/**
 * 会話をAIに渡す形にする。添付付きの発言のうち、直近のもの（ATTACHMENT_MESSAGES_WITH_CONTENT 個）だけ
 * 中身（写真・ファイル）を渡し、それより古いものは「何が付いていたか」だけ伝える（料金を抑えるため）。
 */
export async function toProviderMessages(
  messages: ValidMessage[],
  download: (path: string) => Promise<Uint8Array>,
): Promise<ProviderMessage[]> {
  const withFiles = messages
    .map((m, i) => (m.role === 'user' && m.attachments.length ? i : -1))
    .filter((i) => i >= 0)
    .slice(-ATTACHMENT_MESSAGES_WITH_CONTENT);
  return Promise.all(
    messages.map(async (m, i): Promise<ProviderMessage> => {
      if (!m.attachments.length) return { role: m.role, content: m.content };
      // AIが作った画像は、中身は渡さず「ここで画像を作った」とだけ伝える
      if (m.role === 'assistant') {
        const note = `[You created and showed an image here: ${m.attachments.map((a) => a.name).join(', ')}]`;
        return {
          role: 'assistant',
          content: [m.content, note].filter((t) => t.trim()).join('\n\n'),
        };
      }
      if (!withFiles.includes(i)) {
        const text = [m.content, attachmentNote(m.attachments)]
          .filter((t) => t.trim())
          .join('\n\n');
        return { role: m.role, content: text };
      }
      const parts: ContentPart[] = [];
      if (m.content.trim()) parts.push({ type: 'text', text: m.content });
      for (const a of m.attachments) parts.push(attachmentPart(a, await download(a.path)));
      return { role: m.role, content: parts };
    }),
  );
}

/** 安全チェックに渡すもの：最新の発言の文章と、1枚目の写真 */
function moderationInput(message: ProviderMessage): ModerationInput {
  if (typeof message.content === 'string') return message.content;
  const texts = message.content.filter((p) => p.type === 'text').map((p) => p.text);
  const image = message.content.find((p) => p.type === 'image_url');
  const input: Exclude<ModerationInput, string> = [];
  if (texts.length) input.push({ type: 'text', text: texts.join('\n\n').slice(0, 8000) });
  if (image) input.push(image);
  return input.length ? input : '';
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
    if (
      e.status === 401 ||
      e.status === 403 ||
      e.status === 404 ||
      e.code === 'insufficient_quota'
    ) {
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
  extra?: Record<string, unknown>,
) {
  const body = { type: 'error', code, ...(reason ? { reason } : {}), ...(extra ?? {}) };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
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

/** 画像を作ってほしそうな発言か（ゆるめに判定。実際に作るかはAIが決める） */
export function looksLikeImageRequest(text: string): boolean {
  return /画像|イラスト|絵|描いて|描け|かいて|生成|写真を作|作画|ロゴ|アイコン|壁紙|image|picture|illustrat|draw|drawing|paint|sketch|logo|wallpaper|이미지|그림|그려|图|画|圖|imagen|dibuj|dessin|bild|zeichne|immagine|disegn|imagem|desenh|картин|рисун|нарисуй|صورة|ارسم|चित्र|gambar|ภาพ|วาด|hình|vẽ/i.test(
    text,
  );
}
