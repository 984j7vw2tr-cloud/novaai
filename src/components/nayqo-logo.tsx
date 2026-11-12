/**
 * 「NAYQO」のロゴ文字（光の輪や筋はなし、文字だけ）。
 * 送ってもらったロゴの文字の形（細い幾何学的な書体・横棒のないA・尾のあるQ）を、くっきり描き直したもの。
 * 色は銀色のグラデーション。明るいテーマでは濃いグレーにして読みやすくする。
 */
import { useId } from 'react';
import Svg, {
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Polygon,
  Polyline,
  Stop,
} from 'react-native-svg';

import { isLightTheme } from '@/constants/theme';
import { useTheme } from '@/lib/theme-store';

const W = 1052;
const H = 145;
const STROKE = 22;

export function NayqoLogo({ width = 170 }: { width?: number }) {
  const theme = useTheme();
  const id = `nayqo-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const light = isLightTheme(theme);
  const stops = light ? ['#2B2D33', '#3E4148', '#5D616B'] : ['#FFFFFF', '#CDD1DA', '#8F96A4'];
  const paint = `url(#${id})`;
  const stroke = { stroke: paint, strokeWidth: STROKE, fill: 'none' } as const;

  return (
    <Svg
      width={width}
      height={(width * H) / W}
      viewBox={`0 0 ${W} ${H}`}
      accessibilityRole="image"
      accessibilityLabel="NAYQO">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={stops[0]} />
          <Stop offset="0.5" stopColor={stops[1]} />
          <Stop offset="1" stopColor={stops[2]} />
        </LinearGradient>
      </Defs>
      {/* N */}
      <Polygon points="0,4 22,4 22,133 0,133" fill={paint} />
      <Polygon points="149,4 171,4 171,133 149,133" fill={paint} />
      <Polygon points="0,4 25,4 171,133 146,133" fill={paint} />
      {/* A（横棒なし） */}
      <Polyline points="205,133 309,12 413,133" {...stroke} strokeLinejoin="miter" />
      {/* Y */}
      <Polyline points="424,4 492,80 560,4" {...stroke} strokeLinejoin="miter" />
      <Line x1="492" y1="78" x2="492" y2="133" {...stroke} />
      {/* Q */}
      <Ellipse cx="705" cy="68.5" rx="84" ry="54" {...stroke} />
      <Line x1="722" y1="86" x2="822" y2="142" {...stroke} strokeLinecap="round" />
      {/* O */}
      <Ellipse cx="938" cy="68.5" rx="92" ry="54" {...stroke} />
    </Svg>
  );
}
