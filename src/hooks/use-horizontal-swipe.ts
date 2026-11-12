import { useMemo } from 'react';
import { PanResponder } from 'react-native';

/** これ以上横に動かしたら「スワイプした」とみなす（px） */
const DISTANCE = 50;

/**
 * 横方向のスワイプを見つける（縦のスクロールは邪魔しない）。
 * direction='right' なら右へのスワイプ、'left' なら左へのスワイプで onSwipe を呼ぶ。
 * 返した panHandlers を、スワイプを受け付けたい View に渡す。
 * onSwipe は useCallback などで毎回同じ関数を渡すこと（作り直しを防ぐため）。
 */
export function useHorizontalSwipe(
  direction: 'left' | 'right',
  onSwipe: () => void,
  /** true：中のボタンなどより先に横の動きを受け取る（ボタンが並ぶメニューの上でも効くように） */
  capture = false,
) {
  return useMemo(() => {
    const sign = direction === 'right' ? 1 : -1;
    // はっきり横に動いたときだけ受け取る（縦のスクロール・タップはそのまま）
    const horizontal = (g: { dx: number; dy: number }) =>
      g.dx * sign > 12 && Math.abs(g.dy) < Math.abs(g.dx) * 0.6;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => horizontal(g),
      onMoveShouldSetPanResponderCapture: (_e, g) => capture && horizontal(g),
      onPanResponderRelease: (_e, g) => {
        if (g.dx * sign > DISTANCE && Math.abs(g.dy) < Math.abs(g.dx)) onSwipe();
      },
      onPanResponderTerminationRequest: () => true,
    });
  }, [direction, onSwipe, capture]);
}
