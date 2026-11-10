/** 共通の部品：ボタン・アイコンボタン・入力欄・お知らせ・区切り線（全画面で同じ形・大きさ） */
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { NovaText } from '@/components/nova-text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { isActive } from '@/lib/pressable';

// ---------------------------------------------------------------- 入力欄

export function Field({
  label,
  hint,
  ...input
}: TextInputProps & { label: string; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <NovaText variant="smallMedium" tone="secondary">
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

// ---------------------------------------------------------------- ボタン

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  icon,
  align = 'center',
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  /** ボタンの先頭に付けるアイコン */
  icon?: IconName;
  /** 文字の寄せ方（設定画面のリストのような行では start） */
  align?: 'center' | 'start';
}) {
  const off = disabled || busy;
  const fg =
    variant === 'primary' ? Colors.onAccent : variant === 'danger' ? Colors.danger : Colors.text;
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
        align === 'start' && styles.buttonStart,
        buttonStyles[variant],
        isActive(state) && !off && activeStyles[variant],
        off && styles.off,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <NovaText variant="smallMedium" style={[styles.buttonLabel, { color: fg }]}>
            {label}
          </NovaText>
        </>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- アイコンだけのボタン

export function IconButton({
  icon,
  label,
  onPress,
  size = 'md',
  color = Colors.textSecondary,
  disabled,
  isRTL,
  flipForRTL,
}: {
  icon: IconName;
  /** 画面の読み上げ用の名前（必須） */
  label: string;
  onPress: () => void;
  size?: 'sm' | 'md';
  color?: string;
  disabled?: boolean;
  isRTL?: boolean;
  flipForRTL?: boolean;
}) {
  const box = size === 'sm' ? 32 : 40;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      hitSlop={size === 'sm' ? 6 : 4}
      // Webではマウスを乗せると名前が出る
      {...(Platform.OS === 'web' ? { title: label } : {})}
      style={(state) => [
        styles.iconButton,
        { width: box, height: box },
        isActive(state) && !disabled && styles.iconButtonActive,
        disabled && styles.off,
      ]}>
      <Icon
        name={icon}
        size={size === 'sm' ? 16 : 20}
        color={color}
        isRTL={isRTL}
        flipForRTL={flipForRTL}
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------- お知らせ

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

// ---------------------------------------------------------------- 区切り線

export function Divider({ label }: { label?: string }) {
  if (!label) return <View style={styles.rule} />;
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

// ---------------------------------------------------------------- 設定画面のまとまり

/** 見出し＋中身のまとまり（設定・言語などの画面で使う） */
export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? (
        <NovaText variant="label" tone="muted" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </NovaText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.sm },
  input: {
    ...Type.body,
    minHeight: 48,
    color: Colors.text,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    writingDirection: 'auto',
  },
  inputFocused: { borderColor: Colors.focus },
  button: {
    minHeight: 46,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  buttonStart: { justifyContent: 'flex-start', paddingHorizontal: Spacing.lg },
  buttonLabel: { fontFamily: Fonts.medium, fontSize: 15 },
  off: { opacity: 0.45 },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm + 2,
  },
  iconButtonActive: { backgroundColor: Colors.surfaceRaised },
  notice: { borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  noticeDanger: { backgroundColor: Colors.dangerSurface },
  noticeInfo: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  section: { gap: Spacing.md },
  sectionTitle: { paddingHorizontal: Spacing.xs },
});

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: Colors.accent },
  secondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.dangerSurface },
});

const activeStyles = StyleSheet.create({
  primary: { opacity: 0.88 },
  secondary: { backgroundColor: Colors.surfaceRaised },
  ghost: { backgroundColor: Colors.surface },
  danger: { backgroundColor: Colors.dangerSurface },
});
