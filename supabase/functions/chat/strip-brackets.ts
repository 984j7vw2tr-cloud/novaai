/**
 * 返事から「」『』を取り除く（オーナーの指定：かぎかっこを使わない）。
 * 少しずつ届く文章（ストリーミング）にそのまま使えるよう、1文字ずつ見ていく。
 * コード（```で囲んだ部分・`で囲んだ部分）の中は変えない。
 */
const BRACKETS = new Set(['「', '」', '『', '』']);

export function createBracketStripper() {
  let inFence = false;
  let inInline = false;
  let ticks = 0; // まだ確定していない連続した ` の数

  const resolveTicks = (): string => {
    if (!ticks) return '';
    if (ticks >= 3) inFence = !inFence;
    else if (!inFence) inInline = ticks === 1 ? !inInline : inInline;
    const out = '`'.repeat(ticks);
    ticks = 0;
    return out;
  };

  return {
    /** 届いた文章を受け取り、すぐ送ってよい部分を返す */
    push(text: string): string {
      let out = '';
      for (const ch of text) {
        if (ch === '`') {
          ticks++;
          continue;
        }
        out += resolveTicks();
        if (!inFence && !inInline && BRACKETS.has(ch)) continue;
        out += ch;
      }
      return out;
    },
    /** 最後に残った ` を出す */
    flush(): string {
      return resolveTicks();
    },
  };
}
