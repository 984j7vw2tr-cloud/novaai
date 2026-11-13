/**
 * NAYQOの記憶と宿題。
 * - 答える前：その人について覚えていること（名前・学年・目標など）と、宿題（やると言ったこと）を読み、指示文に入れる
 * - 答えたあと：今のやり取りから、新しく覚えること・宿題・宿題の結果を小さなAIに抜き出させて保存する
 *   （回答が遅くならないよう、回答を返したあとに裏で行う）
 * - 健康・性・宗教・政治・住所・パスワード・自傷などの敏感な情報は覚えない
 * - 本人は設定の「NAYQOの記憶」で、見る・消す・オフにするができる
 */
import type { Env } from './auth.ts';

export type MemoryKind = 'fact' | 'goal' | 'task';
export type TaskStatus = 'open' | 'done' | 'failed' | 'dropped';

export type MemoryItem = {
  id: string;
  kind: MemoryKind;
  content: string;
  due_at: string | null;
  status: TaskStatus;
  reminded_at: string | null;
  created_at: string;
};

/** 覚えておく数の上限（これ以上は増やさない） */
export const MAX_FACTS_AND_GOALS = 60;
export const MAX_OPEN_TASKS = 20;
/** 同じ宿題を「どうなった？」と聞き直すまでの時間 */
export const REMIND_INTERVAL_MS = 20 * 60 * 60 * 1000;

function rest(env: Env) {
  const base = env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

/**
 * 記憶を読む。記憶がオフ・読めないときは enabled: false。
 * 読むのは：その人のこと・目標（新しい順に最大60件）と、まだ終わっていない宿題（最大20件）
 */
export async function loadMemory(
  env: Env,
  doFetch: typeof fetch,
  userId: string,
): Promise<{ enabled: boolean; items: MemoryItem[] }> {
  const r = rest(env);
  if (!r || (env.get('MEMORY') ?? 'on').toLowerCase() === 'off')
    return { enabled: false, items: [] };
  try {
    const [profRes, memRes] = await Promise.all([
      doFetch(`${r.base}/rest/v1/profiles?select=memory_enabled&id=eq.${userId}&limit=1`, {
        headers: r.headers,
        signal: AbortSignal.timeout(4000),
      }),
      doFetch(
        `${r.base}/rest/v1/memories?select=id,kind,content,due_at,status,reminded_at,created_at` +
          `&user_id=eq.${userId}&status=eq.open&order=created_at.desc&limit=${MAX_FACTS_AND_GOALS + MAX_OPEN_TASKS}`,
        { headers: r.headers, signal: AbortSignal.timeout(4000) },
      ),
    ]);
    if (!profRes.ok || !memRes.ok) return { enabled: false, items: [] };
    const prof = ((await profRes.json()) as { memory_enabled?: boolean }[])[0];
    if (prof && prof.memory_enabled === false) return { enabled: false, items: [] };
    return { enabled: true, items: (await memRes.json()) as MemoryItem[] };
  } catch (e) {
    console.error('[memory] load failed', e);
    return { enabled: false, items: [] };
  }
}

const day = (iso: string) => iso.slice(0, 10);

/** 「どうなった？」と聞くべき宿題（期限が来ていて、最近聞いていないもの。いちばん古いもの1つ） */
export function dueTask(items: MemoryItem[], now: number): MemoryItem | null {
  const due = items
    .filter(
      (m) =>
        m.kind === 'task' &&
        m.status === 'open' &&
        m.due_at &&
        Date.parse(m.due_at) <= now &&
        (!m.reminded_at || now - Date.parse(m.reminded_at) >= REMIND_INTERVAL_MS),
    )
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  return due[0] ?? null;
}

/** 宿題を出す・確かめるコーチとしてのルール（記憶がオンのとき指示文に足す） */
export const COACH_RULES = `# Homework coach (NAYQO remembers and follows up)
- NAYQO remembers the user across conversations and holds them accountable. This is NAYQO's signature.
- When the user talks about a personal goal or a problem they want to fix (study, exams, school, part-time job, job hunting, work, money, fitness, diet, habits, relationships, side projects), end your reply with ONE concrete homework with a deadline, in your voice. Examples: 「3日以内に求人を5件見ろ。次来たら報告な」「今日から1週間、毎朝英単語20個。来週チェックするからな」. Keep it small enough to actually do.
- Do NOT give homework for small talk, jokes, simple factual questions, coding, or when the user is in distress.
- When the user reports on homework: done → short, rough praise in your style and raise the bar a little; not done → call it out bluntly (never attack their worth) and give a smaller, concrete next step.`;

/** 覚えていることを指示文にする（なければ空文字） */
export function memoryPrompt(
  items: MemoryItem[],
  now: number,
  opts: { firstMessage: boolean },
): { text: string; remind: MemoryItem | null } {
  const facts = items.filter((m) => m.kind === 'fact');
  const goals = items.filter((m) => m.kind === 'goal');
  const tasks = items.filter((m) => m.kind === 'task' && m.status === 'open');
  const parts: string[] = [COACH_RULES];
  if (facts.length || goals.length || tasks.length) {
    const lines: string[] = [
      `# What you remember about this user`,
      `Use this naturally when relevant (their name, school, job, goals). Never list it back, and never say "according to my memory". If the user now says something different, trust the user.`,
    ];
    for (const m of facts) lines.push(`- ${m.content}`);
    for (const m of goals) lines.push(`- Goal: ${m.content}`);
    for (const m of tasks) {
      const due = m.due_at
        ? Date.parse(m.due_at) <= now
          ? ` (deadline ${day(m.due_at)} — passed)`
          : ` (deadline ${day(m.due_at)})`
        : '';
      lines.push(`- Homework: ${m.content}${due}`);
    }
    parts.push(lines.join('\n'));
  }
  const remind = opts.firstMessage ? dueTask(items, now) : null;
  if (remind) {
    parts.push(
      `# Homework check — do this in THIS reply\nThis is the start of a new conversation and this homework's deadline has passed: "${remind.content}". Ask whether they did it, bluntly and briefly (e.g. 「で、${remind.content}はやったのか？」). If their message is about something else, answer it first and ask in one line at the end. Ask only about this one.`,
    );
  }
  return { text: parts.join('\n\n'), remind };
}

/** 「どうなった？」と聞いた時刻を記録（同じ日に何度も聞かないため） */
export async function markReminded(env: Env, doFetch: typeof fetch, userId: string, id: string) {
  const r = rest(env);
  if (!r) return;
  await doFetch(`${r.base}/rest/v1/memories?id=eq.${id}&user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...r.headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ reminded_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}

// ---- 答えたあと：覚えることを抜き出して保存 ----

export type MemoryChanges = {
  add: { kind: MemoryKind; content: string; due_in_days: number | null }[];
  complete: { id: string; status: 'done' | 'failed' | 'dropped' }[];
  remove: string[];
};

const EXTRACT_SYSTEM = `You maintain the long-term memory of NAYQO, a blunt coaching AI for young people. From the existing memory and the latest exchange, decide what to change. Most exchanges need NO change: then return empty arrays.

add:
- kind "fact": stable personal info useful later — name or nickname, age or school year, school/major, job or part-time job, life stage (受験生, 就活中, 転職活動中), important ongoing situations, how they want to be called.
- kind "goal": something they want to achieve (e.g. TOEIC 800点を取る, 10kg痩せる, 起業する).
- kind "task": a concrete action the USER committed to, or homework NAYQO gave in its reply (and the user did not refuse). Set due_in_days from the wording (今日=0, 明日=1, 3日以内=3, 1週間/来週=7); if no deadline is given use 7.
complete: when the user reports on an EXISTING task (use its id): "done", "failed" (didn't do it), or "dropped" (gave up / no longer relevant).
remove: ids of existing facts/goals that are now wrong or replaced (then add the new version).

Rules:
- NEVER store: health or medical info, mental health, sexual matters or orientation, religion, political views, ethnicity, exact addresses, phone numbers, emails, passwords, financial account numbers, crimes, anything about self-harm, or private details about other people.
- Do not store opinions about one-off topics, things the user asked about out of curiosity, or anything already in memory (no duplicates).
- Write each content short (under 60 characters) in the user's language, e.g. 「大学2年生」「名前はタカシ」「TOEIC 800点を取りたい」「毎朝英単語を20個覚える」.
- One homework = one task. "Report back" / 「報告しろ」 is part of the homework, not a separate task. If NAYQO's reply adjusts a task the user just committed to, store only the adjusted version.
- At most 5 adds.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['add', 'complete', 'remove'],
  properties: {
    add: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'content', 'due_in_days'],
        properties: {
          kind: { type: 'string', enum: ['fact', 'goal', 'task'] },
          content: { type: 'string' },
          due_in_days: { type: ['integer', 'null'] },
        },
      },
    },
    complete: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['done', 'failed', 'dropped'] },
        },
      },
    },
    remove: { type: 'array', items: { type: 'string' } },
  },
};

/** 小さなAIに「覚えること」を抜き出させる */
export async function extractMemoryChanges(
  env: Env,
  doFetch: typeof fetch,
  input: { items: MemoryItem[]; userText: string; assistantText: string; today: string },
): Promise<MemoryChanges | null> {
  const apiKey = env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  const baseUrl = (env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const existing = input.items.length
    ? input.items
        .map(
          (m) =>
            `- id=${m.id} [${m.kind}] ${m.content}${m.due_at ? ` (deadline ${day(m.due_at)})` : ''}`,
        )
        .join('\n')
    : '(empty)';
  const res = await doFetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.get('MEMORY_MODEL') ?? 'gpt-5.4-mini',
      store: false,
      input: [
        { role: 'system', content: EXTRACT_SYSTEM },
        {
          role: 'user',
          content: `Today: ${input.today}\n\nExisting memory:\n${existing}\n\nLatest exchange:\nUSER: ${input.userText.slice(0, 4000)}\nNAYQO: ${input.assistantText.slice(0, 4000)}`,
        },
      ],
      text: {
        format: { type: 'json_schema', name: 'memory_changes', schema: SCHEMA, strict: true },
      },
      max_output_tokens: 2000,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    console.error(`[memory] extract HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    output_text?: string;
    output?: { type: string; content?: { type: string; text?: string }[] }[];
  };
  const text =
    data.output_text ??
    data.output
      ?.filter((o) => o.type === 'message')
      .flatMap((o) => o.content ?? [])
      .map((c) => c.text ?? '')
      .join('');
  try {
    return JSON.parse(text ?? '') as MemoryChanges;
  } catch {
    return null;
  }
}

/** 抜き出した変更を保存する（数の上限・形のチェックつき）。保存した件数を返す */
export async function applyMemoryChanges(
  env: Env,
  doFetch: typeof fetch,
  userId: string,
  items: MemoryItem[],
  changes: MemoryChanges,
  now: number,
): Promise<{ added: number; completed: number; removed: number }> {
  const r = rest(env);
  const result = { added: 0, completed: 0, removed: 0 };
  if (!r) return result;
  const known = new Map(items.map((m) => [m.id, m]));
  const json = { ...r.headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

  const existingText = new Set(items.map((m) => m.content.trim()));
  let factsAndGoals = items.filter((m) => m.kind !== 'task').length;
  let openTasks = items.filter((m) => m.kind === 'task' && m.status === 'open').length;
  const rows = [];
  for (const a of (changes.add ?? []).slice(0, 5)) {
    const content = String(a.content ?? '')
      .trim()
      .slice(0, 300);
    if (!content || existingText.has(content)) continue;
    if (!['fact', 'goal', 'task'].includes(a.kind)) continue;
    if (a.kind === 'task') {
      if (openTasks >= MAX_OPEN_TASKS) continue;
      openTasks++;
    } else {
      if (factsAndGoals >= MAX_FACTS_AND_GOALS) continue;
      factsAndGoals++;
    }
    const days = Number.isInteger(a.due_in_days) ? Math.min(Math.max(a.due_in_days!, 0), 365) : 7;
    const due = a.kind === 'task' ? new Date(now + days * 86400000).toISOString() : null;
    rows.push({ user_id: userId, kind: a.kind, content, due_at: due });
    existingText.add(content);
  }
  if (rows.length) {
    const res = await doFetch(`${r.base}/rest/v1/memories`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) result.added = rows.length;
    else console.error(`[memory] insert HTTP ${res.status}`);
  }
  const at = new Date(now).toISOString();
  for (const c of changes.complete ?? []) {
    const m = known.get(c.id);
    if (!m || m.kind !== 'task' || !['done', 'failed', 'dropped'].includes(c.status)) continue;
    const res = await doFetch(`${r.base}/rest/v1/memories?id=eq.${c.id}&user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ status: c.status, checked_at: at, updated_at: at }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) result.completed++;
  }
  for (const id of changes.remove ?? []) {
    const m = known.get(id);
    if (!m || m.kind === 'task') continue;
    const res = await doFetch(`${r.base}/rest/v1/memories?id=eq.${id}&user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: json,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) result.removed++;
  }
  return result;
}
