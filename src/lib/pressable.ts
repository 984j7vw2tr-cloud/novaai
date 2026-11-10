import type { PressableStateCallbackType } from 'react-native';

/**
 * ボタンが「押されている」または「マウスが乗っている（PCのみ）」かどうか。
 * hovered は Web だけにある値なので、型には含まれていない。
 */
export function isActive(state: PressableStateCallbackType) {
  return state.pressed || Boolean((state as { hovered?: boolean }).hovered);
}
