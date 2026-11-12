/**
 * NAYQO の Q マーク（枠なし・マークだけ）。色はテーマに合わせて変えられる。
 * 形はアイコン（黒い角丸の中の銀色のQ）と同じ：角の丸い輪っか＋下の切れ目＋内側に立つ短い柱。
 */
import { Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';

// viewBox 208×173 の中の形（外側→柱→内側の順に一筆でなぞる）
const Q_PATH =
  'M75 173 H45 A45 45 0 0 1 0 128 V45 A45 45 0 0 1 45 0 H163 A45 45 0 0 1 208 45 V128 ' +
  'A45 45 0 0 1 163 173 H101 V112 A16 16 0 0 1 133 112 V139 H162 A12 12 0 0 0 174 127 ' +
  'V47 A12 12 0 0 0 162 35 H46 A12 12 0 0 0 34 47 V127 A12 12 0 0 0 46 139 H75 Z';

export function QMark({ size = 20, color = Colors.text }: { size?: number; color?: string }) {
  const h = (size * 173) / 208;
  const svg = (fill: string) => (
    <Svg width={size} height={h} viewBox="0 0 208 173" accessibilityElementsHidden>
      <Path d={Q_PATH} fill={fill} />
    </Svg>
  );
  // Web：テーマの色（CSS変数）を外側から受け継ぐ
  if (Platform.OS === 'web' && color.startsWith('var(')) {
    return (
      <span style={{ color, display: 'inline-flex', lineHeight: 0 }}>{svg('currentColor')}</span>
    );
  }
  return svg(color);
}
