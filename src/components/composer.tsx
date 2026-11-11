import { type Ref, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputKeyPressEvent,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Icon } from '@/components/icons';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { isActive } from '@/lib/pressable';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  /** 回答中に「停止」を押したとき */
  onStop?: () => void;
  /** AIが考え中・回答中かどうか。true のときは送信ボタンが停止ボタンになる */
  busy?: boolean;
  autoFocus?: boolean;
  inputRef?: Ref<TextInputInstance>;
};

const BUTTON = 36;
const LINE = 24;
const MIN_HEIGHT = LINE + 16;
const MAX_HEIGHT = 220;

/** メッセージ入力欄＋送信（停止）ボタン */
export function Composer({
  value,
  onChangeText,
  onSubmit,
  onStop,
  busy,
  autoFocus,
  inputRef,
}: Props) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  // Web では入力欄が自動で伸びないので、文字の量に合わせて高さを計算する
  const [webHeight, setWebHeight] = useState(MIN_HEIGHT);
  // 送信して空になったら、1行の高さに戻す
  if (Platform.OS === 'web' && value === '' && webHeight !== MIN_HEIGHT) {
    setWebHeight(MIN_HEIGHT);
  }
  const canSend = value.trim().length > 0 && !busy;

  const submit = () => {
    if (canSend) onSubmit();
  };

  // Web（PC）では Enter で送信、Shift+Enter で改行。
  // 日本語入力の変換確定の Enter では送信しない。
  const handleKeyPress = (e: TextInputKeyPressEvent) => {
    if (Platform.OS !== 'web') return;
    const ev = e.nativeEvent as TextInputKeyPressEvent['nativeEvent'] & {
      shiftKey?: boolean;
      isComposing?: boolean;
      keyCode?: number;
    };
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <View style={[styles.container, focused && styles.containerFocused]}>
      <TextInput
        ref={inputRef}
        style={[styles.input, Platform.OS === 'web' && { height: webHeight }]}
        {...(Platform.OS === 'web' ? { rows: 1 } : null)}
        onContentSizeChange={(e) => {
          if (Platform.OS !== 'web') return;
          const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, e.nativeEvent.contentSize.height));
          setWebHeight(h);
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={t.composerPlaceholder}
        placeholderTextColor={Colors.textMuted}
        multiline
        autoFocus={autoFocus}
        onKeyPress={handleKeyPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={Colors.accent}
        textAlignVertical="center"
        accessibilityLabel={t.composerPlaceholder}
      />
      {busy ? (
        <Pressable
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel={t.stop}
          style={(state) => [styles.button, styles.buttonOn, isActive(state) && styles.pressed]}>
          {/* 停止：塗りつぶしの四角 */}
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Rect x={0} y={0} width={12} height={12} rx={2.5} fill={Colors.onAccent} />
          </Svg>
        </Pressable>
      ) : (
        <Pressable
          onPress={submit}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t.send}
          aria-disabled={!canSend}
          style={(state) => [
            styles.button,
            canSend ? styles.buttonOn : styles.buttonOff,
            canSend && isActive(state) && styles.pressed,
          ]}>
          <Icon
            name="send"
            size={18}
            strokeWidth={2.25}
            color={canSend ? Colors.onAccent : Colors.textMuted}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 28,
    paddingStart: Spacing.xl - 4,
    paddingEnd: Spacing.sm + 2,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  containerFocused: { borderColor: Colors.focus },
  input: {
    ...Type.body,
    flex: 1,
    minHeight: MIN_HEIGHT - 4,
    maxHeight: MAX_HEIGHT,
    lineHeight: LINE,
    color: Colors.text,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: 6,
    writingDirection: 'auto',
  },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  buttonOn: { backgroundColor: Colors.accent },
  buttonOff: { backgroundColor: Colors.surfaceRaised },
  pressed: { opacity: 0.82 },
});
