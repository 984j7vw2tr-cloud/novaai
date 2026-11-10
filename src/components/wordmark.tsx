import { Platform, StyleSheet, View } from 'react-native';

import { NovaText } from '@/components/nova-text';
import { Colors } from '@/constants/theme';

const LTR_WEB = (Platform.OS === 'web' ? { dir: 'ltr' } : {}) as object;
// スマホ用：右から左の言語でも並びを反転させない（Webでは使えないスタイルなので分ける）
const LTR_NATIVE = Platform.OS === 'web' ? null : ({ direction: 'ltr' } as const);

/** 「NOVA AI」のロゴ文字。size で大きさを変える。 */
export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <View
      // ロゴはどの言語でも「NOVA AI」の並び（Web用）
      {...LTR_WEB}
      style={[styles.row, LTR_NATIVE]}
      accessibilityRole="header"
      accessibilityLabel="NOVA AI">
      <NovaText
        style={[
          styles.nova,
          { fontSize: size, lineHeight: size * 1.15, letterSpacing: size * 0.28 },
        ]}>
        NOVA
      </NovaText>
      <NovaText
        style={[
          styles.ai,
          {
            fontSize: size * 0.42,
            lineHeight: size * 0.5,
            letterSpacing: size * 0.08,
            marginBottom: size * 0.14,
          },
        ]}>
        AI
      </NovaText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  nova: { color: Colors.text, fontWeight: '300' },
  ai: { color: Colors.accent, fontWeight: '600' },
});
