import { useState, type Ref } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputKeyPressEvent,
} from 'react-native';

import { NovaText } from '@/components/nova-text';
import { strings } from '@/constants/strings';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

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

/** メッセージ入力欄＋送信（停止）ボタン */
export function Composer({ value, onChangeText, onSubmit, onStop, busy, autoFocus, inputRef }: Props) {
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
        placeholder={strings.composerPlaceholder}
        placeholderTextColor={Colors.textMuted}
        multiline
        autoFocus={autoFocus}
        onKeyPress={handleKeyPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={Colors.accent}
        textAlignVertical="center"
        accessibilityLabel={strings.composerPlaceholder}
      />
      {busy ? (
        <Pressable
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel={strings.stop}
          style={({ pressed }) => [styles.button, styles.buttonActive, pressed && styles.pressed]}>
          <View style={styles.stopIcon} />
        </Pressable>
      ) : (
        <Pressable
          onPress={submit}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={strings.send}
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => [
            styles.button,
            canSend ? styles.buttonActive : styles.buttonDisabled,
            pressed && styles.pressed,
          ]}>
          <NovaText style={[styles.arrow, !canSend && styles.arrowDisabled]}>↑</NovaText>
        </Pressable>
      )}
    </View>
  );
}

const BUTTON = 38;
const MIN_HEIGHT = BUTTON;
const MAX_HEIGHT = 180;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  containerFocused: {
    borderColor: Colors.accentMuted,
  },
  input: {
    flex: 1,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    color: Colors.text,
    fontFamily: FontFamily,
    fontSize: 16,
    lineHeight: 22,
    paddingTop: Platform.OS === 'ios' ? 9 : 8,
    paddingBottom: 8,
    writingDirection: 'auto',
  },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: { backgroundColor: Colors.accent },
  buttonDisabled: { backgroundColor: Colors.surfaceRaised },
  pressed: { opacity: 0.7 },
  arrow: { color: Colors.background, fontSize: 19, lineHeight: 22, fontWeight: '700' },
  arrowDisabled: { color: Colors.textMuted },
  stopIcon: { width: 12, height: 12, borderRadius: 2, backgroundColor: Colors.background },
});
