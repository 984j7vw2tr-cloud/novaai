/**
 * 写真・ファイルを「1日に何回添付したか」の記録（attachment_uses テーブル。サーバー専用）。
 * 同じファイルを何度送っても（再生成など）1回と数える。
 */
import type { Env } from './auth.ts';

const WINDOW_MS = 24 * 60 * 60 * 1000;

function rest(env: Env) {
  const base = env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) return null;
  return {
    url: `${base}/rest/v1/attachment_uses`,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  };
}

/** 直近24時間に添付したファイルの場所の一覧。調べられなければ null（止めずに通す） */
export async function recentAttachmentPaths(
  env: Env,
  doFetch: typeof fetch,
  userId: string,
  now: number,
): Promise<string[] | null> {
  const r = rest(env);
  if (!r) return null;
  try {
    const since = new Date(now - WINDOW_MS).toISOString();
    const res = await doFetch(
      `${r.url}?select=path&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(since)}&limit=1000`,
      { headers: r.headers, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ((await res.json()) as { path: string }[]).map((x) => x.path);
  } catch (e) {
    console.error('[attachments] usage check failed', e);
    return null;
  }
}

/** 添付したファイルを記録する（すでにあれば何もしない） */
export async function recordAttachmentPaths(
  env: Env,
  doFetch: typeof fetch,
  userId: string,
  paths: string[],
) {
  const r = rest(env);
  if (!r || !paths.length) return;
  try {
    const res = await doFetch(`${r.url}?on_conflict=user_id,path`, {
      method: 'POST',
      headers: { ...r.headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(paths.map((path) => ({ user_id: userId, path }))),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`[attachments] record failed: HTTP ${res.status}`);
  } catch (e) {
    console.error('[attachments] record error', e);
  }
}
