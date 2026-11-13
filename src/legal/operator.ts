/**
 * 運営者の情報（利用規約・プライバシーポリシー・特定商取引法の表記で共通）。
 * 正式な名前・問い合わせ先が決まったら、ここを書き換える。
 */
export const OPERATOR = {
  /** 運営者名（仮） */
  nameJa: 'NAYQO運営事務局',
  nameEn: 'NAYQO Team',
  /** 問い合わせ先のメールアドレス（空なら「準備中」と表示） */
  contactEmail: '',
  /** 最終更新日 */
  updated: '2026-11-13',
};

export const contactJa = () =>
  OPERATOR.contactEmail || '準備中（決まり次第、このページに掲載します）';
export const contactEn = () =>
  OPERATOR.contactEmail || 'Coming soon (we will post it on this page)';
