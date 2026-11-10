import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, FontFamily } from '@/constants/theme';

type Variant = 'body' | 'small' | 'caption' | 'title' | 'label';
type Tone = 'primary' | 'secondary' | 'muted' | 'accent' | 'danger';

export type NovaTextProps = TextProps & {
  variant?: Variant;
  tone?: Tone;
};

/** アプリ全体で使う文字。フォント・色・大きさをここで統一する。 */
export function NovaText({ variant = 'body', tone = 'primary', style, ...rest }: NovaTextProps) {
  return <Text style={[styles.base, styles[variant], toneStyles[tone], style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: {
    fontFamily: FontFamily,
    // 右から左に書く言語（アラビア語など）でも自然に並ぶように
    writingDirection: 'auto',
  },
  body: { fontSize: 16, lineHeight: 26 },
  small: { fontSize: 14, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 17 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '600', letterSpacing: -0.4 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 2.2 },
});

const toneStyles = StyleSheet.create({
  primary: { color: Colors.text },
  secondary: { color: Colors.textSecondary },
  muted: { color: Colors.textMuted },
  accent: { color: Colors.accent },
  danger: { color: Colors.danger },
});
