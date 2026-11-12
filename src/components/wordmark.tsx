import { Image, Platform, StyleSheet, View } from 'react-native';

import { NovaText } from '@/components/nova-text';
import { Colors, Fonts } from '@/constants/theme';

const LTR_WEB = (Platform.OS === 'web' ? { dir: 'ltr' } : {}) as object;
// スマホ用：右から左の言語でも並びを反転させない（Webでは使えないスタイルなので分ける）
const LTR_NATIVE = Platform.OS === 'web' ? null : ({ direction: 'ltr' } as const);

/** NAYQO のマーク（アプリのアイコンと同じ絵） */
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

/** 「NAYQO」のロゴ文字。size で大きさを変える。withMark でマークを左に付ける。 */
export function Wordmark({ size = 18, withMark = false }: { size?: number; withMark?: boolean }) {
  return (
    <View
      // ロゴはどの言語でも「NAYQO」の並び（Web用）
      {...LTR_WEB}
      style={[styles.row, LTR_NATIVE]}
      accessibilityRole="header"
      accessibilityLabel="NAYQO">
      {withMark ? (
        <View style={{ marginRight: size * 0.5, marginBottom: size * 0.06 }}>
          <BrandMark size={size * 1.3} />
        </View>
      ) : null}
      <NovaText
        style={[
          styles.name,
          { fontSize: size, lineHeight: size * 1.25, letterSpacing: size * 0.12 },
        ]}>
        NAYQO
      </NovaText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  // 目立つように太字（Web では日本語以外も含めて太さを指定）
  name: {
    color: Colors.text,
    fontFamily: Fonts.bold,
    ...(Platform.OS === 'web' ? { fontWeight: '700' as const } : null),
  },
});
