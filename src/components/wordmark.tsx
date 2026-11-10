import { StyleSheet, View } from 'react-native';

import { NovaText } from '@/components/nova-text';
import { Colors } from '@/constants/theme';

/** 「NOVA AI」のロゴ文字。size で大きさを変える。 */
export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="NOVA AI">
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
