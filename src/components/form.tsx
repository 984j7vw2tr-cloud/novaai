/** 入力欄とボタン（ログイン・登録・プロフィール画面で共通） */
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { NovaText } from '@/components/nova-text';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { isActive } from '@/lib/pressable';

export function Field({
  label,
  hint,
  ...input
}: TextInputProps & { label: string; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <NovaText variant="small" tone="secondary">
        {label}
      </NovaText>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={Colors.textMuted}
        selectionColor={Colors.accent}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused, input.style]}
      />
      {hint ? (
        <NovaText variant="caption" tone="muted">
          {hint}
        </NovaText>
      ) : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || busy;
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={off}
      aria-busy={busy}
      style={(state) => [
        styles.button,
        primary ? styles.primary : danger ? styles.danger : styles.secondary,
        isActive(state) && (primary ? styles.primaryActive : styles.secondaryActive),
        off && styles.off,
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? Colors.background : Colors.accent} />
      ) : (
        <NovaText
          style={[
            styles.label,
            primary ? styles.primaryLabel : danger ? styles.dangerLabel : styles.secondaryLabel,
          ]}>
          {label}
        </NovaText>
      )}
    </Pressable>
  );
}

/** エラー・お知らせの枠 */
export function Notice({ text, tone }: { text: string; tone: 'danger' | 'info' }) {
  return (
    <View
      style={[styles.notice, tone === 'danger' ? styles.noticeDanger : styles.noticeInfo]}
      accessibilityRole="alert">
      <NovaText variant="small" tone={tone === 'danger' ? 'danger' : 'primary'}>
        {text}
      </NovaText>
    </View>
  );
}

/** 「または」の区切り線 */
export function Divider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.line} />
      <NovaText variant="caption" tone="muted">
        {label}
      </NovaText>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.xs },
  input: {
    minHeight: 48,
    color: Colors.text,
    fontFamily: FontFamily,
    fontSize: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    writingDirection: 'auto',
  },
  inputFocused: { borderColor: Colors.accentMuted },
  button: {
    minHeight: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  primary: { backgroundColor: Colors.accent },
  primaryActive: { opacity: 0.85 },
  secondary: { borderWidth: 1, borderColor: Colors.border },
  danger: {
    borderWidth: 1,
    borderColor: Colors.dangerSurface,
    backgroundColor: Colors.dangerSurface,
  },
  dangerLabel: { color: Colors.danger },
  secondaryActive: { backgroundColor: Colors.surfaceRaised },
  off: { opacity: 0.5 },
  label: { fontSize: 16, fontWeight: '600' },
  primaryLabel: { color: Colors.background },
  secondaryLabel: { color: Colors.text },
  notice: { borderRadius: Radius.md, padding: Spacing.lg },
  noticeDanger: { backgroundColor: Colors.dangerSurface },
  noticeInfo: { borderWidth: 1, borderColor: Colors.accentMuted },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
});
