import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { NovaText } from '@/components/nova-text';
import { Colors, Fonts } from '@/constants/theme';

const LTR_WEB = (Platform.OS === 'web' ? { dir: 'ltr' } : {}) as object;
// スマホ用：右から左の言語でも並びを反転させない（Webでは使えないスタイルなので分ける）
const LTR_NATIVE = Platform.OS === 'web' ? null : ({ direction: 'ltr' } as const);

/**
 * 「辛」の字を直線で組んだ形（文字のフォントに頼らず、どの端末でも同じ形になる）。
 * 24×24 の枠の中の座標。
 */
export const KANJI_RECTS: [number, number, number, number][] = [
  [11.1, 3.6, 1.8, 2.4], // 点
  [6.2, 6.4, 11.6, 1.7], // 一本目の横線
  [8.6, 8.9, 1.7, 2.6], // 左の短い線
  [13.7, 8.9, 1.7, 2.6], // 右の短い線
  [5.2, 11.9, 13.6, 1.7], // 二本目の横線
  [6.6, 15.4, 10.8, 1.7], // 三本目の横線
  [11.1, 11.9, 1.8, 8.6], // 縦の線
];

/**
 * Karakuchi のマーク：赤い印（はんこ）の中に「辛」の字（辛口＝忖度しない、鋭い）。
 * 角を少し丸めた四角。どの大きさでも崩れないようにSVGで描く。
 */
export function BrandMark({
  size = 24,
  color = Colors.accent,
  glyph = Colors.onAccent,
}: {
  size?: number;
  color?: string;
  glyph?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={0.5} y={0.5} width={23} height={23} rx={5.5} fill={color} />
      {KANJI_RECTS.map(([x, y, w, h], i) => (
        <Rect key={i} x={x} y={y} width={w} height={h} rx={0.35} fill={glyph} />
      ))}
    </Svg>
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
          <BrandMark size={size * 1.15} />
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
