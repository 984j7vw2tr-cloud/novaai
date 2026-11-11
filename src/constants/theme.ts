/**
 * Karakuchi AI のデザインシステム（色・文字・余白・角の丸み・レイアウト）。
 * 画面の見た目は、すべてここの値から作る。値を変えれば全画面に反映される。
 *
 * 方針：黒・白・赤（＋補助のグレー）だけ。赤はブランドの色として、要所にだけ使う
 * （送信ボタン・主要なボタン・ロゴ・選択中の印）。グラデーションや強い影は使わない。
 * 長時間見ても疲れないよう、背景は真っ黒より少し明るく、文字は真っ白より少し落とす。
 */

import '@/global.css';

import { Platform, type TextStyle } from 'react-native';

export const Colors = {
  /** 画面の背景（黒） */
  background: '#0A0A0A',
  /** サイドバーの背景（背景よりほんの少し明るい） */
  sidebar: '#111111',
  /** 面：入力欄・ユーザーの吹き出し・カード */
  surface: '#171717',
  /** 一段明るい面：ホバー・押したとき・選択中 */
  surfaceRaised: '#212121',
  /** 区切り線・枠線 */
  border: '#2B2B2B',
  /** ごく薄い区切り線 */
  borderSubtle: '#1F1F1F',
  /** 文字（白） */
  text: '#F2F2F2',
  /** 補助の文字 */
  textSecondary: '#A3A3A3',
  /** さらに控えめな文字（注意書き・日付） */
  textMuted: '#6B6B6B',
  /** ブランドの赤（アイコンのえんじ色に合わせた深い赤。送信ボタン・主要なボタン） */
  accent: '#B02A40',
  /** 文字で使うブランド色（アイコンの銅色。リンク・ロゴの「AI」。黒の上でも読みやすい明るさ） */
  accentText: '#EBA27A',
  /** 赤の上に乗る文字・アイコン（白） */
  onAccent: '#FFFFFF',
  /** 赤を薄くした色（引用の線・選択中の印など、控えめな赤） */
  accentMuted: '#4E1824',
  /** フォーカス時の枠（赤みのある控えめな色） */
  focus: '#8A3346',
  /** コードブロックの背景 */
  code: '#111111',
  /** エラー（ブランドの赤と区別するため、少し明るいピンク寄りの赤） */
  danger: '#FF6B6B',
  dangerSurface: '#2A1213',
} as const;

/** 余白（4の倍数） */
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
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** 画面の幅の区切り */
export const Breakpoints = {
  /** これ以上の幅では、サイドバーを常に表示する */
  desktop: 1024,
} as const;

export const Layout = {
  /** 会話の本文の最大幅（読みやすい長さ） */
  contentWidth: 760,
  /** フォームの最大幅（ログイン・設定） */
  formWidth: 440,
  sidebarWidth: 272,
  headerHeight: 56,
} as const;

/** Webでは英字のあとに各OSの読みやすい日本語・多言語フォントを続ける */
const WEB_FALLBACK =
  "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans Arabic', 'Noto Sans Thai', 'Noto Sans Devanagari', Meiryo, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'";

const family = (name: string) => (Platform.OS === 'web' ? `${name}, ${WEB_FALLBACK}` : name);

/**
 * フォント（英字は Inter。日本語など英字以外は、各OSの標準フォントで自動的に表示される）。
 * スマホでは太さごとにフォント名が違うので、太さは fontWeight ではなくこの名前で指定する。
 */
export const Fonts = {
  light: family('Inter_300Light'),
  regular: family('Inter_400Regular'),
  medium: family('Inter_500Medium'),
  semibold: family('Inter_600SemiBold'),
  mono: Platform.OS === 'web' ? "JetBrainsMono_400Regular, ui-monospace, Menlo, Consolas, monospace" : 'JetBrainsMono_400Regular',
} as const;

/** 互換用（以前のコードが使っている名前） */
export const FontFamily = Fonts.regular;

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'letterSpacing' | 'fontFamily'>;

/**
 * 文字の階層。見出し・本文・補足の大きさ、行間、文字間隔をここで統一する。
 */
export const Type = {
  display: { fontFamily: Fonts.semibold, fontSize: 30, lineHeight: 38, letterSpacing: -0.6 },
  title: { fontFamily: Fonts.semibold, fontSize: 22, lineHeight: 30, letterSpacing: -0.3 },
  heading: { fontFamily: Fonts.semibold, fontSize: 17, lineHeight: 24, letterSpacing: -0.15 },
  body: { fontFamily: Fonts.regular, fontSize: 16, lineHeight: 26, letterSpacing: -0.1 },
  bodyMedium: { fontFamily: Fonts.medium, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  small: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20, letterSpacing: -0.05 },
  smallMedium: { fontFamily: Fonts.medium, fontSize: 14, lineHeight: 20, letterSpacing: -0.05 },
  caption: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  label: { fontFamily: Fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
  mono: { fontFamily: Fonts.mono, fontSize: 13.5, lineHeight: 21, letterSpacing: 0 },
} as const satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof Type;

/** 互換用：以前の名前 */
export const MaxContentWidth = Layout.contentWidth;

/** 動きの速さ（短く、控えめに） */
export const Motion = {
  fast: 120,
  base: 200,
  slow: 280,
} as const;
