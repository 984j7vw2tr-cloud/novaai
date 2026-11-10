#!/usr/bin/env node
/**
 * データベースの安全ルール（RLS）の確認。
 * テスト用アカウントでログインし、「できるべきこと」と「できてはいけないこと」を実際に試す。
 * 使い方：NODE_USE_ENV_PROXY=1 node scripts/test-rls.mjs
 * 必要なもの：.env.local（または環境変数）に接続先と NOVA_TEST_EMAIL / NOVA_TEST_PASSWORD
 * 作ったデータは最後に消す。
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const envFile = path.join(root, '.env.local');
const fileEnv = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs
        .readFileSync(envFile, 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {};
const env = (k) => process.env[k] ?? fileEnv[k];
const URL_BASE = env('EXPO_PUBLIC_SUPABASE_URL');
const KEY = env('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const EMAIL = env('NOVA_TEST_EMAIL');
const PASSWORD = env('NOVA_TEST_PASSWORD');
if (!URL_BASE || !KEY || !EMAIL || !PASSWORD) {
  console.error('接続先またはテスト用アカウントが設定されていません');
  process.exit(1);
}

const login = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!login.ok) {
  console.error(`ログインできません（HTTP ${login.status}）`);
  process.exit(1);
}
const { access_token: TOKEN, user } = await login.json();
const ME = user.id;

/** データベースへの問い合わせ（as: 'user' = ログイン中、'anon' = 未ログイン） */
async function rest(method, pathAndQuery, body, as = 'user') {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(as === 'user' ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // 本文なし
  }
  return { status: res.status, data };
}

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${!ok && detail ? `  （${detail}）` : ''}`);
  ok ? pass++ : fail++;
};
const okStatus = (s) => s >= 200 && s < 300;
const rows = (r) => (Array.isArray(r.data) ? r.data : []);

// ---- 未ログインの人 ----
for (const table of ['profiles', 'conversations', 'messages', 'usage_events', 'subscriptions']) {
  const r = await rest('GET', `${table}?select=*`, null, 'anon');
  check(`未ログインでは ${table} を読めない`, !okStatus(r.status) || rows(r).length === 0, `HTTP ${r.status}`);
}

// ---- 自分のプロフィール ----
const profiles = await rest('GET', 'profiles?select=*');
check('プロフィールは自分の1件だけ見える', rows(profiles).length === 1 && rows(profiles)[0].id === ME);
const upName = await rest('PATCH', `profiles?id=eq.${ME}`, { display_name: 'RLS Test' });
check('表示名は変えられる', okStatus(upName.status) && rows(upName)[0]?.display_name === 'RLS Test');
const upEmail = await rest('PATCH', `profiles?id=eq.${ME}`, { email: 'hacker@evil.test' });
check('メールアドレスは書き換えられない', !okStatus(upEmail.status), `HTTP ${upEmail.status}`);

// ---- 会話 ----
const conv = await rest('POST', 'conversations', { title: 'RLS テスト' });
const convId = rows(conv)[0]?.id;
check('会話を作れて、持ち主が自分になる', okStatus(conv.status) && rows(conv)[0]?.user_id === ME);

const forged = await rest('POST', 'conversations', { title: 'なりすまし', user_id: randomUUID() });
check('他人を持ち主にした会話は作れない', !okStatus(forged.status), `HTTP ${forged.status}`);

const steal = await rest('PATCH', `conversations?id=eq.${convId}`, { user_id: randomUUID() });
check('会話の持ち主は書き換えられない', !okStatus(steal.status), `HTTP ${steal.status}`);
const rename = await rest('PATCH', `conversations?id=eq.${convId}`, { title: '新しい題名' });
check('会話の題名は変えられる', okStatus(rename.status) && rows(rename)[0]?.title === '新しい題名');

// ---- メッセージ ----
const before = rows(await rest('GET', `conversations?id=eq.${convId}&select=updated_at`))[0]?.updated_at;
await new Promise((r) => setTimeout(r, 1100));
const msg = await rest('POST', 'messages', { conversation_id: convId, role: 'user', content: 'こんにちは' });
check('自分の会話にメッセージを書ける', okStatus(msg.status));
const after = rows(await rest('GET', `conversations?id=eq.${convId}&select=updated_at`))[0]?.updated_at;
check('メッセージを書くと会話の最終更新が新しくなる', Boolean(before && after && after > before));

const intoOther = await rest('POST', 'messages', {
  conversation_id: randomUUID(),
  role: 'user',
  content: '他人の会話に書き込み',
});
check('自分のものでない会話には書き込めない', !okStatus(intoOther.status), `HTTP ${intoOther.status}`);
const badRole = await rest('POST', 'messages', { conversation_id: convId, role: 'system', content: 'x' });
check('role は user / assistant 以外にできない', !okStatus(badRole.status), `HTTP ${badRole.status}`);

// ---- 使用量・料金プラン（サーバーだけが書く） ----
const fakeUsage = await rest('POST', 'usage_events', { user_id: ME, model: 'x', input_tokens: 0, output_tokens: 0 });
check('使用量は自分で書き込めない（ごまかせない）', !okStatus(fakeUsage.status), `HTTP ${fakeUsage.status}`);
const fakePlan = await rest('POST', 'subscriptions', { user_id: ME, plan: 'pro' });
check('料金プランは自分で書き込めない', !okStatus(fakePlan.status), `HTTP ${fakePlan.status}`);
const usage = await rest('GET', 'usage_events?select=user_id');
check('使用量は読める（自分の分だけ）', okStatus(usage.status) && rows(usage).every((u) => u.user_id === ME));

// ---- 削除 ----
const del = await rest('DELETE', `conversations?id=eq.${convId}`);
check('会話を削除できる', okStatus(del.status));
const leftover = await rest('GET', `messages?conversation_id=eq.${convId}&select=id`);
check('会話を消すと、その中のメッセージも消える', rows(leftover).length === 0);

// 後片付け（表示名を元に戻す）
await rest('PATCH', `profiles?id=eq.${ME}`, { display_name: user.user_metadata?.display_name ?? null });

console.log(`\n結果：${pass}件OK / ${fail}件NG`);
process.exit(fail ? 1 : 0);
