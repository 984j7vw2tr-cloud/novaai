import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { NovaText } from '@/components/nova-text';
import { Colors, Fonts } from '@/constants/theme';

const LTR_WEB = (Platform.OS === 'web' ? { dir: 'ltr' } : {}) as object;
// スマホ用：右から左の言語でも並びを反転させない（Webでは使えないスタイルなので分ける）
const LTR_NATIVE = Platform.OS === 'web' ? null : ({ direction: 'ltr' } as const);

/**
 * NOVA のマーク：4つの光の先をもつ星（nova ＝ 新しく輝く星）。
 * 細くシャープな形で、どの大きさでも崩れないようにSVGで描く。
 */
export function BrandMark({ size = 24, color = Colors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 1.5C12.55 8.2 15.8 11.45 22.5 12C15.8 12.55 12.55 15.8 12 22.5C11.45 15.8 8.2 12.55 1.5 12C8.2 11.45 11.45 8.2 12 1.5Z"
        fill={color}
      />
    </Svg>
  );
}

/** 「NOVA AI」のロゴ文字。size で大きさを変える。withMark でマークを左に付ける。 */
export function Wordmark({ size = 18, withMark = false }: { size?: number; withMark?: boolean }) {
  return (
    <View
      // ロゴはどの言語でも「NOVA AI」の並び（Web用）
      {...LTR_WEB}
      style={[styles.row, LTR_NATIVE]}
      accessibilityRole="header"
      accessibilityLabel="NOVA AI">
      {withMark ? (
        <View style={{ marginRight: size * 0.45, marginBottom: size * 0.12 }}>
          <BrandMark size={size * 0.95} />
        </View>
      ) : null}
      <NovaText
        style={[
          styles.nova,
          { fontSize: size, lineHeight: size * 1.2, letterSpacing: size * 0.3 },
        ]}>
        NOVA
      </NovaText>
      <NovaText
        style={[
          styles.ai,
          {
            fontSize: size * 0.4,
            lineHeight: size * 0.5,
            letterSpacing: size * 0.1,
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
  nova: { color: Colors.text, fontFamily: Fonts.light },
  ai: { color: Colors.textSecondary, fontFamily: Fonts.semibold },
});
