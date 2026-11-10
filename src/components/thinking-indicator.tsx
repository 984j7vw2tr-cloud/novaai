import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { NovaText } from '@/components/nova-text';
import { strings } from '@/constants/strings';
import { Colors, Spacing } from '@/constants/theme';

/** AIが考え中のときに出す、控えめな「・・・」表示 */
export function ThinkingIndicator() {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.25)));

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, {
            toValue: 1,
            duration: 420,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.25,
            duration: 420,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={styles.row} accessibilityLabel={strings.thinking} accessibilityRole="progressbar">
      <NovaText variant="small" tone="secondary">
        {strings.thinking}
      </NovaText>
      <View style={styles.dots}>
        {dots.map((opacity, i) => (
          <Animated.View key={i} style={[styles.dot, { opacity }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },
});
