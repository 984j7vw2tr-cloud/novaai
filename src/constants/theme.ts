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

/** ダーク（最初からのKarakuchiの色）。ほかのテーマも同じ項目を持つ */
const DARK = {
  /** 画面の背景 */
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
  /** 文字 */
  text: '#F2F2F2',
  /** 補助の文字 */
  textSecondary: '#A3A3A3',
  /** さらに控えめな文字（注意書き・日付） */
  textMuted: '#6B6B6B',
  /** ブランドの色（送信ボタン・主要なボタン） */
  accent: '#B02A40',
  /** 文字で使うブランド色（リンク・ロゴの「AI」） */
  accentText: '#EBA27A',
  /** ブランドの色の上に乗る文字・アイコン */
  onAccent: '#FFFFFF',
  /** ブランドの色を薄くした色（引用の線・選択中の印など） */
  accentMuted: '#4E1824',
  /** フォーカス時の枠 */
  focus: '#8A3346',
  /** コードブロックの背景 */
  code: '#111111',
  /** エラー */
  danger: '#FF6B6B',
  dangerSurface: '#2A1213',
};

export type Palette = Record<keyof typeof DARK, string>;

/** 外観（テーマ）の種類 */
export type ThemeName = 'dark' | 'light' | 'green' | 'purple' | 'pink';
export const THEME_NAMES: ThemeName[] = ['dark', 'light', 'green', 'purple', 'pink'];

/** テーマごとの色。明るいテーマでは文字を黒にする */
export const Palettes: Record<ThemeName, Palette> = {
  dark: DARK,
  // ライト（白）：文字は黒
  light: {
    background: '#FFFFFF',
    sidebar: '#F7F7F8',
    surface: '#F2F2F3',
    surfaceRaised: '#E8E8EB',
    border: '#DADADE',
    borderSubtle: '#EBEBEE',
    text: '#111111',
    textSecondary: '#4C4C52',
    textMuted: '#8A8A91',
    accent: '#B02A40',
    accentText: '#A3243A',
    onAccent: '#FFFFFF',
    accentMuted: '#F2D6DC',
    focus: '#D9A0AB',
    code: '#F4F4F5',
    danger: '#C62F37',
    dangerSurface: '#FDECEC',
  },
  // ライトグリーン：明るい緑の背景に、黒っぽい文字
  green: {
    background: '#F0FAF3',
    sidebar: '#E3F4E9',
    surface: '#FFFFFF',
    surfaceRaised: '#D7EEDF',
    border: '#BFE0CB',
    borderSubtle: '#D5ECDD',
    text: '#0F241A',
    textSecondary: '#3D5A4A',
    textMuted: '#779484',
    accent: '#2E9C61',
    accentText: '#1E7448',
    onAccent: '#FFFFFF',
    accentMuted: '#C9EAD6',
    focus: '#7CC29C',
    code: '#E7F4EC',
    danger: '#C62F37',
    dangerSurface: '#FDECEC',
  },
  // パープル：深い紫の背景に、白っぽい文字
  purple: {
    background: '#16111F',
    sidebar: '#1C1527',
    surface: '#241B33',
    surfaceRaised: '#2F2440',
    border: '#3C2F51',
    borderSubtle: '#281F38',
    text: '#F3EEFA',
    textSecondary: '#B8A9CB',
    textMuted: '#7F7096',
    accent: '#8A5CF5',
    accentText: '#C6A8FF',
    onAccent: '#FFFFFF',
    accentMuted: '#3A2A5C',
    focus: '#6E4BC4',
    code: '#1C1527',
    danger: '#FF6B6B',
    dangerSurface: '#2E1420',
  },
  // ライトピンク：淡いピンクの背景に、黒っぽい文字
  pink: {
    background: '#FFF4F7',
    sidebar: '#FDE9F0',
    surface: '#FFFFFF',
    surfaceRaised: '#FADBE6',
    border: '#F1C6D4',
    borderSubtle: '#F7DAE4',
    text: '#2A1219',
    textSecondary: '#6D4551',
    textMuted: '#A17D88',
    accent: '#DD527C',
    accentText: '#BF3862',
    onAccent: '#FFFFFF',
    accentMuted: '#F9D0DD',
    focus: '#EC98B1',
    code: '#FCEEF3',
    danger: '#C62F37',
    dangerSurface: '#FDECEC',
  },
};

/** 明るいテーマか（スクロールバーやフォームの色合わせに使う） */
export const isLightTheme = (name: ThemeName) =>
  name === 'light' || name === 'green' || name === 'pink';

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** CSS変数の名前（例：textSecondary → --c-text-secondary） */
export const cssVar = (key: string) => `--c-${kebab(key)}`;

/**
 * 画面で使う色。
 * Web：CSS変数（var(--c-...)）。テーマを切り替えると、画面を作り直さずにすぐ色が変わる。
 * スマホアプリ：今はダークのみ（テーマ切り替えはWeb版で対応）。
 */
export const Colors: Palette =
  Platform.OS === 'web'
    ? (Object.fromEntries(
        Object.keys(DARK).map((k) => [k, `var(${cssVar(k)}, ${DARK[k as keyof Palette]})`]),
      ) as Palette)
    : DARK;

/** テーマごとのCSS変数の定義（Webの <head> に入れる） */
export function themeCss(): string {
  const block = (p: Palette) =>
    Object.entries(p)
      .map(([k, v]) => `${cssVar(k)}:${v};`)
      .join('');
  return [
    `:root{${block(DARK)}color-scheme:dark;}`,
    ...THEME_NAMES.filter((n) => n !== 'dark').map(
      (n) =>
        `:root[data-theme="${n}"]{${block(Palettes[n])}color-scheme:${isLightTheme(n) ? 'light' : 'dark'};}`,
    ),
  ].join('\n');
}

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
  mono:
    Platform.OS === 'web'
      ? 'JetBrainsMono_400Regular, ui-monospace, Menlo, Consolas, monospace'
      : 'JetBrainsMono_400Regular',
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
