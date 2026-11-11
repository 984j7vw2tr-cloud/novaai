/**
 * アイコン（Lucide。線の太さと大きさを統一して使う）。
 * 新しいアイコンが必要なときは、ここに追加してから使う。
 */
import {
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Globe,
  History,
  LogOut,
  type LucideIcon,
  Menu,
  PanelLeft,
  RotateCcw,
  Settings,
  Square,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react-native';

import { Colors } from '@/constants/theme';

export const Icons = {
  send: ArrowUp,
  stop: Square,
  newChat: SquarePen,
  menu: Menu,
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
  return (
    <Component
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      style={flipForRTL && isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
    />
  );
}
