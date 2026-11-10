import { Image, Platform, StyleSheet, View } from 'react-native';

import { NovaText } from '@/components/nova-text';
import { Colors, Fonts } from '@/constants/theme';

const LTR_WEB = (Platform.OS === 'web' ? { dir: 'ltr' } : {}) as object;
// スマホ用：右から左の言語でも並びを反転させない（Webでは使えないスタイルなので分ける）
const LTR_NATIVE = Platform.OS === 'web' ? null : ({ direction: 'ltr' } as const);

/** Karakuchi のマーク：炎とハートと星（アプリのアイコンと同じ絵。背景は透明） */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/images/brand-mark.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/** 「KARAKUCHI AI」のロゴ文字。size で大きさを変える。withMark で炎のマークを左に付ける。 */
export function Wordmark({ size = 18, withMark = false }: { size?: number; withMark?: boolean }) {
  return (
    <View
      // ロゴはどの言語でも「KARAKUCHI AI」の並び（Web用）
      {...LTR_WEB}
      style={[styles.row, LTR_NATIVE]}
      accessibilityRole="header"
      accessibilityLabel="Karakuchi AI">
      {withMark ? (
        <View style={{ marginRight: size * 0.5, marginBottom: size * 0.06 }}>
          <BrandMark size={size * 1.3} />
        </View>
      ) : null}
      <NovaText
        style={[
          styles.name,
          { fontSize: size, lineHeight: size * 1.2, letterSpacing: size * 0.16 },
        ]}>
        KARAKUCHI
      </NovaText>
      <NovaText
        style={[
          styles.ai,
          {
            fontSize: size * 0.42,
            lineHeight: size * 0.5,
            letterSpacing: size * 0.08,
            marginLeft: size * 0.22,
            marginBottom: size * 0.2,
          },
        ]}>
        AI
      </NovaText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  name: { color: Colors.text, fontFamily: Fonts.semibold },
  ai: { color: Colors.accent, fontFamily: Fonts.semibold },
});
