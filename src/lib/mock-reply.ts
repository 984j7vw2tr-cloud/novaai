import type { ReplySource } from '@/lib/chat-types';

/**
 * デモ用の回答（AIにはまだつながっていない）。
 * 画面の動き（考え中 → 少しずつ表示 → 完了）を確認するためのもの。
 * PHASE 4 でサーバー経由の本物の回答に置き換える。
 *
 * テスト用：「/error」と送ると、わざと失敗してエラー表示を確認できる。
 */
export const mockReply: ReplySource = async (history, { onDelta, signal }) => {
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const question = lastUser?.content.trim() ?? '';

  await wait(700, signal);

  if (question === '/error') {
    throw new Error('Simulated error');
  }

  const excerpt = question.length > 60 ? `${question.slice(0, 60)}…` : question;
  const text = [
    '【デモ返答】まだAIにはつながっていません。',
    '',
    `受け取った質問：「${excerpt}」`,
    '',
    'PHASE 4でAIに接続すると、ここにKarakuchiの本物の回答が少しずつ表示されます。回答は基本的に次の流れになります。',
    '',
    '1. 結論',
    '2. 問題点と、なぜ問題なのか',
    '3. 根拠',
    '4. 実行できる改善策と次の行動',
  ].join('\n');

  // 2〜4文字ずつ、少し間をあけて届ける（本物のストリーミングに近い動き）
  let i = 0;
  while (i < text.length) {
    await wait(24, signal);
    const size = 2 + Math.floor(Math.random() * 3);
    onDelta(text.slice(i, i + size));
    i += size;
  }
};

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
