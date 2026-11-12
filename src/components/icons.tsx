/**
 * アイコン（Lucide。線の太さと大きさを統一して使う）。
 * 新しいアイコンが必要なときは、ここに追加してから使う。
 */
import {
  ArrowUp,
  AudioLines,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  FileText,
  Globe,
  History,
  Image as ImageIcon,
  LogOut,
  type LucideIcon,
  Menu,
  MessageCircleDashed,
  MessageCircleCheck,
  Mic,
  MicOff,
  PanelLeft,
  Paperclip,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react-native';

import { Platform } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { Colors } from '@/constants/theme';

/** 2本線のメニューアイコン（上が長く、下が短い） */
function TwoLines({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line
        x1={3.5}
        y1={8}
        x2={20.5}
        y2={8}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Line
        x1={3.5}
        y1={16}
        x2={14}
        y2={16}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export const Icons = {
  send: ArrowUp,
  stop: Square,
  newChat: SquarePen,
  menu: Menu,
  /** ChatGPT風の2本線（下の線が短い） */
  menu2: TwoLines as unknown as LucideIcon,
  temporary: MessageCircleDashed,
  temporaryOn: MessageCircleCheck,
  sidebar: PanelLeft,
  close: X,
  copy: Copy,
  check: Check,
  regenerate: RotateCcw,
  back: ChevronLeft,
  forward: ChevronRight,
  trash: Trash2,
  settings: Settings,
  language: Globe,
  history: History,
  logout: LogOut,
  plus: Plus,
  camera: Camera,
  image: ImageIcon,
  file: FileText,
  attach: Paperclip,
  mic: Mic,
  micOff: MicOff,
  voiceMode: AudioLines,
  plan: CreditCard,
  sparkle: Sparkles,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof Icons;

export function Icon({
  name,
  size = 20,
  color = Colors.textSecondary,
  strokeWidth = 1.75,
  flipForRTL = false,
  isRTL = false,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** 右から左の言語で左右反転するアイコン（矢印など） */
  flipForRTL?: boolean;
  isRTL?: boolean;
}) {
  const Component = Icons[name];
  const flip = flipForRTL && isRTL ? { transform: [{ scaleX: -1 }] } : undefined;
  // Web：色がテーマのCSS変数（var(...)）のときは、外側の色を受け継ぐ（currentColor）。
  // SVGの属性には var(...) を直接書けないため。テーマを切り替えるとすぐ色が変わる。
  if (Platform.OS === 'web' && color.startsWith('var(')) {
    return (
      <span style={{ color, display: 'inline-flex', lineHeight: 0 }}>
        <Component size={size} color="currentColor" strokeWidth={strokeWidth} style={flip} />
      </span>
    );
  }
  return <Component size={size} color={color} strokeWidth={strokeWidth} style={flip} />;
}
