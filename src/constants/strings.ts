/**
 * 画面に表示する文言。
 * PHASE 6（多言語対応）で、言語ごとのファイルに分けて切り替えられるようにします。
 * 今は日本語だけですが、画面のコードに文字を直接書かず、ここに集めておきます。
 */
export const strings = {
  brandTagline: 'ONE AI. EVERY LANGUAGE. NO FILTER.',
  homeHeadline: '忖度なしで答える。',
  homeSubline: '世界中の人々に、忖度のない知性を。',
  composerPlaceholder: '何でも聞いて。お世辞は言わない。',
  send: '送信',
  stop: '停止',
  suggestionsTitle: 'たとえば',
  suggestions: [
    'この事業アイデアの弱点を指摘して',
    '英語の勉強、本当に効果がある方法は？',
    '今の会社を辞めるべきか迷ってる',
    'Explain quantum computing without hype',
  ],
  newChat: '新しいチャット',
  back: '戻る',
  chatEmptyTitle: '何が聞きたい？',
  chatEmptyBody: '結論から、根拠つきで答える。',
  thinking: '考え中',
  copy: 'コピー',
  copied: 'コピーしました',
  regenerate: '再生成',
  retry: 'もう一度試す',
  stopped: '（ここで停止しました）',
  errorGeneric: '回答を受け取れませんでした。もう一度試してください。',
  errorNetwork: '通信が切れました。接続を確認して、もう一度試してください。',
  errorRateLimited: '送信が多すぎます。少し待ってから、もう一度試してください。',
  errorUnavailable: '今はNOVAを利用できません。時間をおいて、もう一度試してください。',
  errorInvalid: 'この内容は送れませんでした。長すぎる場合は短くしてください。',
  disclaimer: 'NOVAは間違えることがあります。重要な判断は自分でも確認してください。',
  demoNotice: 'デモ表示中：AIはまだ接続されていません',
} as const;
