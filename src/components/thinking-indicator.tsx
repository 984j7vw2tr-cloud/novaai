import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useI18n } from '@/i18n';

const SIZE = 14;

/**
 * AIが考え中のときの表示：えんじ色の〇が、ゆっくり大きく・小さくなりながら点滅する（ChatGPT風）。
 * 文字やアイコンは出さない（読み上げ用に「考え中」とだけ伝える）。
 */
export function ThinkingIndicator() {
  const { t } = useI18n();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  return (
    <View style={styles.row} accessibilityLabel={t.thinking} accessibilityRole="progressbar">
      <Animated.View style={[styles.dot, { opacity, transform: [{ scale }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 26, justifyContent: 'center', alignSelf: 'flex-start' },
  dot: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: Colors.accent },
});
