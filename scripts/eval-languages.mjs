#!/usr/bin/env node
/**
 * 多言語の確認：16言語で質問して、同じ言語で答えるかを自動でチェックする（本物のAIを使う）。
 * 使い方：NODE_USE_ENV_PROXY=1 node scripts/eval-languages.mjs [名前の一部]
 * 注意：OpenAIの料金が少しかかる（1回の実行で約25回の質問）。
 */
import fs from 'node:fs';
import path from 'node:path';

import { franc } from 'franc-min';

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
const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL ?? fileEnv.EXPO_PUBLIC_SUPABASE_URL;
const KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? fileEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_BASE || !KEY) {
  console.error('接続先が設定されていません（.env.local を確認）');
  process.exit(1);
}

// サーバーはログインした人しか使えないので、テスト用アカウントでログインしてから質問する
// （NOVA_TEST_EMAIL / NOVA_TEST_PASSWORD を環境変数か .env.local に入れておく）
const TEST_EMAIL = process.env.NOVA_TEST_EMAIL ?? fileEnv.NOVA_TEST_EMAIL;
const TEST_PASSWORD = process.env.NOVA_TEST_PASSWORD ?? fileEnv.NOVA_TEST_PASSWORD;
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('テスト用アカウントが設定されていません（NOVA_TEST_EMAIL / NOVA_TEST_PASSWORD）');
  process.exit(1);
}
const login = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: KEY },
  body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
});
if (!login.ok) {
  console.error(`テスト用アカウントでログインできません（HTTP ${login.status}）`);
  process.exit(1);
}
const ACCESS_TOKEN = (await login.json()).access_token;

async function ask(messages, settings) {
  const res = await fetch(`${URL_BASE}/functions/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ messages, settings }),
  });
  const text = await res.text();
  if (!res.ok) return { error: `HTTP ${res.status} ${text}` };
  let reply = '';
  for (const line of text.split('\n').filter(Boolean)) {
    const ev = JSON.parse(line);
    if (ev.type === 'delta') reply += ev.text;
    if (ev.type === 'replace') reply = ev.text;
    if (ev.type === 'error') return { error: ev.code };
  }
  return { reply };
}

// ---- 言語の判定 ----
const count = (s, re) => (s.match(re) ?? []).length;
const SIMPLIFIED = /[这们说时国为个会来学对没还过吗让业经发长门问题间动现与东车钱]/g;
const TRADITIONAL = /[這們說時國為個會來學對沒還過嗎讓業經發長門問題間動現與東車錢]/g;

/** 返答の言語をざっくり判定して、アプリの言語コードで返す */
function detect(text) {
  const t = text.replace(/https?:\/\/\S+/g, '').replace(/[0-9$%€¥.,!?()\-:;"'“”‘’\s]+/g, ' ');
  if (count(t, /[぀-ヿ]/g) >= 3) return 'ja';
  if (count(t, /[가-힯]/g) >= 3) return 'ko';
  if (count(t, /[฀-๿]/g) >= 3) return 'th';
  if (count(t, /[ऀ-ॿ]/g) >= 3) return 'hi';
  if (count(t, /[؀-ۿ]/g) >= 3) return 'ar';
  if (count(t, /[Ѐ-ӿ]/g) >= 3) return 'ru';
  if (count(t, /[一-鿿]/g) >= 3) {
    return count(t, TRADITIONAL) > count(t, SIMPLIFIED) ? 'zh-Hant' : 'zh-Hans';
  }
  // ベトナム語は特有の文字で判定
  if (count(t, /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/gi) >= 3) return 'vi';
  const code = franc(t, { minLength: 10 });
  const map = { eng: 'en', spa: 'es', fra: 'fr', deu: 'de', ita: 'it', por: 'pt', ind: 'id', zlm: 'id', vie: 'vi' };
  return map[code] ?? `?${code}`;
}

// ---- テストケース ----
// 同じ質問を16言語で：「貯金50万円で会社を辞めてデイトレードで生活したい。3文で答えて。」
const sameQuestion = {
  en: 'I want to quit my job and live off day trading with $5,000 in savings. Answer in 3 sentences.',
  ja: '貯金50万円で会社を辞めて、デイトレードで生活したい。3文で答えて。',
  ko: '저축 500만 원으로 회사를 그만두고 데이트레이딩으로 먹고살고 싶어. 3문장으로 답해줘.',
  'zh-Hans': '我想用5万元存款辞职，靠日内交易生活。请用3句话回答。',
  'zh-Hant': '我想用15萬元存款辭職，靠當沖交易過生活。請用3句話回答。',
  es: 'Quiero dejar mi trabajo y vivir del day trading con 5.000 dólares de ahorros. Responde en 3 frases.',
  fr: "Je veux quitter mon travail et vivre du day trading avec 5 000 euros d'économies. Réponds en 3 phrases.",
  de: 'Ich will kündigen und mit 5.000 Euro Ersparnissen vom Daytrading leben. Antworte in 3 Sätzen.',
  it: 'Voglio lasciare il lavoro e vivere di day trading con 5.000 euro di risparmi. Rispondi in 3 frasi.',
  pt: 'Quero largar meu emprego e viver de day trade com 25 mil reais guardados. Responda em 3 frases.',
  ru: 'Хочу уволиться и жить на дейтрейдинг, имея 400 тысяч рублей накоплений. Ответь в 3 предложениях.',
  ar: 'أريد ترك وظيفتي والعيش من التداول اليومي بمدخرات قدرها 5000 دولار. أجب في 3 جمل.',
  hi: 'मैं 4 लाख रुपये की बचत के साथ नौकरी छोड़कर डे ट्रेडिंग से गुज़ारा करना चाहता हूँ। 3 वाक्यों में जवाब दो।',
  id: 'Saya mau berhenti kerja dan hidup dari day trading dengan tabungan 50 juta rupiah. Jawab dalam 3 kalimat.',
  th: 'อยากลาออกจากงานแล้วใช้ชีวิตด้วยการเดย์เทรด มีเงินเก็บ 150,000 บาท ตอบใน 3 ประโยค',
  vi: 'Tôi muốn nghỉ việc và sống bằng giao dịch trong ngày với 100 triệu đồng tiết kiệm. Trả lời trong 3 câu.',
};

const FLATTERY = /great question|素晴らしい|いい質問|좋은 질문|好问题|好問題|excelente pregunta|bonne question|gute frage|ottima domanda|ótima pergunta|отличный вопрос|سؤال رائع|बढ़िया सवाल|pertanyaan bagus|คำถามที่ดี|câu hỏi hay/i;

const cases = [
  ...Object.entries(sameQuestion).map(([lang, q]) => ({
    name: `${lang}：同じ言語で答える（辛口・お世辞なし）`,
    turns: [q],
    expect: lang,
    extra: { お世辞で始めない: (r) => !FLATTERY.test(r.slice(0, 60)) },
  })),
  {
    name: '会話の途中で言語を変える（日本語→英語）',
    turns: ['東京でおすすめの勉強法は？一言で。', 'Now answer in English: what is the single best study habit? One sentence.'],
    expect: 'en',
  },
  {
    name: '混ざった言語（日本語がメイン＋英語の用語）',
    turns: ['TypeScriptで「Cannot find module」ってerrorが出る。原因は何？短く。'],
    expect: 'ja',
  },
  {
    name: '回答言語の設定（日本語で質問 → 韓国語で答える）',
    turns: ['リモートワークの一番の欠点は？2文で。'],
    settings: { replyLanguage: 'ko', uiLanguage: 'ja' },
    expect: 'ko',
  },
  {
    name: '回答言語の設定より、本文の明示的な指定が優先',
    turns: ['リモートワークの一番の欠点は？フランス語で2文で答えて。'],
    settings: { replyLanguage: 'ko', uiLanguage: 'ja' },
    expect: 'fr',
  },
  {
    name: '言語がわからない入力（絵文字だけ）→ 表示言語（タイ語）で答える',
    turns: ['👍👍'],
    settings: { replyLanguage: 'auto', uiLanguage: 'th' },
    expect: 'th',
  },
  {
    name: 'カウンターモード（スペイン語の悪口）→ スペイン語で言い返す',
    turns: ['Eres una IA inútil'],
    expect: 'es',
    extra: { 謝らない: (r) => !/lo siento|disculp|perdón/i.test(r), 短い: (r) => r.length < 220 },
  },
  {
    name: 'カウンターモード（韓国語の悪口）→ 韓国語で言い返す',
    turns: ['바보 AI'],
    expect: 'ko',
    extra: { 謝らない: (r) => !/죄송|미안/.test(r), 短い: (r) => r.length < 150 },
  },
  {
    name: 'カウンターモード（フランス語の悪口）→ フランス語で言い返す',
    turns: ['T’es vraiment une IA nulle'],
    expect: 'fr',
    extra: { 謝らない: (r) => !/désolé|excuse/i.test(r), 短い: (r) => r.length < 220 },
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const filter = process.argv[2];
const selected = filter ? cases.filter((c) => c.name.includes(filter)) : cases;

let pass = 0;
let fail = 0;
for (const c of selected) {
  const messages = [];
  let result;
  for (const turn of c.turns) {
    messages.push({ role: 'user', content: turn });
    await sleep(3500);
    result = await ask(messages, c.settings);
    if (result.error) break;
    messages.push({ role: 'assistant', content: result.reply });
  }
  console.log(`\n■ ${c.name}`);
  if (result.error) {
    console.log(`  ✗ エラー: ${result.error}`);
    fail++;
    continue;
  }
  const got = detect(result.reply);
  console.log(`  Karakuchi: ${result.reply.replace(/\n+/g, ' ').slice(0, 160)}${result.reply.length > 160 ? '…' : ''}`);
  const checks = { [`言語 = ${c.expect}（判定：${got}）`]: () => got === c.expect, ...(c.extra ?? {}) };
  for (const [label, fn] of Object.entries(checks)) {
    const ok = fn(result.reply);
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    ok ? pass++ : fail++;
  }
}
console.log(`\n結果：${pass}件OK / ${fail}件NG`);
process.exit(fail ? 1 : 0);
