import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { NovaText } from '@/components/nova-text';
import { BrandMark } from '@/components/wordmark';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';

/**
 * AIが考え中のときの表示：NOVAの星がゆっくり呼吸するように明滅する。
 * 動きは小さく、ゆっくり（長く見ていても気にならないように）。
 */
export function ThinkingIndicator() {
  const { t } = useI18n();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const rotate = pulse.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <View style={styles.row} accessibilityLabel={t.thinking} accessibilityRole="progressbar">
      <Animated.View style={{ opacity, transform: [{ scale }, { rotate }] }}>
        <BrandMark size={16} />
      </Animated.View>
      <NovaText variant="small" tone="muted">
        {t.thinking}
      </NovaText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2, paddingVertical: 3 },
});
