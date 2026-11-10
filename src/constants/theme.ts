/**
 * NOVA AI のデザインの決まり（色・余白・角の丸み・文字）。
 * 色や余白を変えたいときは、このファイルだけを直せば全画面に反映されます。
 */

import '@/global.css';

import { Platform } from 'react-native';

/** NOVAはダークモードが基本。色は1セットだけ持つ。 */
export const Colors = {
  /** メイン背景：ブラック */
  background: '#000000',
  /** サブ背景：ダークグレー（入力欄・ユーザーの吹き出しなど） */
  surface: '#111113',
  /** サブ背景より一段明るい面（押したとき・候補チップなど） */
  surfaceRaised: '#1B1B1E',
  /** 細い区切り線 */
  border: '#2A2A2E',
  /** 文字：ホワイト */
  text: '#FFFFFF',
  /** 補助文字：グレー */
  textSecondary: '#9A9AA0',
  /** さらに控えめな文字（注意書きなど） */
  textMuted: '#616168',
  /** アクセント：シルバー */
  accent: '#C8CBD0',
  /** アクセントの暗い版（押せないボタンなど） */
  accentMuted: '#4A4B4F',
  /** エラー表示 */
  danger: '#FF7A7A',
  dangerSurface: '#2A1414',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

/** PCなど広い画面でも、文章が読みやすい幅に収める */
export const MaxContentWidth = 760;

/** 多言語に対応できるよう、各OSの標準フォントを使う（Webは global.css で指定） */
export const FontFamily = Platform.select({
  web: 'var(--font-sans)',
  default: undefined,
});
