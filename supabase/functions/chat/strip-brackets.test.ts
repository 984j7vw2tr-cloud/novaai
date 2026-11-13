// 「」『』を取り除く処理の自動テスト
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBracketStripper } from './strip-brackets.ts';

const run = (chunks: string[]) => {
  const s = createBracketStripper();
  return chunks.map((c) => s.push(c)).join('') + s.flush();
};

test('「」『』を取り除く（ほかの文字はそのまま）', () => {
  assert.equal(
    run(['標準語の「みたい」は、『コンビニ人間』（小説）がいい']),
    '標準語のみたいは、コンビニ人間（小説）がいい',
  );
});

test('少しずつ届いても同じ結果', () => {
  assert.equal(run(['「あ', 'い」う', '『え』']), 'あいうえ');
});

test('コードの中は変えない（```と`）', () => {
  assert.equal(
    run(['「外」\n```js\nconst s = "「中」";\n```\n「外」と `「中」` と「外」']),
    '外\n```js\nconst s = "「中」";\n```\n外と `「中」` と外',
  );
  // ``` が分かれて届いても
  assert.equal(run(['「a」`', '``\n「b」\n`', '``「c」']), 'a```\n「b」\n```c');
});
