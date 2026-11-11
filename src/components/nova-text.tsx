import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, Type, type TypeVariant } from '@/constants/theme';

type Tone = 'primary' | 'secondary' | 'muted' | 'accent' | 'danger' | 'onAccent';

export type NovaTextProps = TextProps & {
  /** 文字の階層（display / title / heading / body / small / caption / label など） */
  variant?: TypeVariant;
  tone?: Tone;
};

/** アプリ全体で使う文字。フォント・大きさ・行間・色をデザインシステムに合わせる。 */
export function NovaText({ variant = 'body', tone = 'primary', style, ...rest }: NovaTextProps) {
  return <Text style={[styles.base, Type[variant], toneStyles[tone], style]} {...rest} />;
}

const styles = StyleSheet.create({
  // 右から左に書く言語（アラビア語など）でも自然に並ぶように
  base: { writingDirection: 'auto' },
});

const toneStyles = StyleSheet.create({
  primary: { color: Colors.text },
  secondary: { color: Colors.textSecondary },
  muted: { color: Colors.textMuted },
  accent: { color: Colors.accentText },
  danger: { color: Colors.danger },
  onAccent: { color: Colors.onAccent },
});
