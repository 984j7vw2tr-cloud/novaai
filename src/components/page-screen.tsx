/** 設定・言語・履歴などのページの共通の枠（戻るボタン・題名・読みやすい幅） */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/form';
import { Icon, type IconName } from '@/components/icons';
import { NovaText } from '@/components/nova-text';
import { Colors, Layout, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { isActive } from '@/lib/pressable';

/** ページの中身の最大幅（設定は本文より少し細く） */
const PAGE_WIDTH = 640;

export function PageScreen({
  title,
  children,
  scroll = true,
}: {
  title: string;
  children: ReactNode;
  /** false のときは中身が自分でスクロールする（一覧など） */
  scroll?: boolean;
}) {
  const { t, isRTL } = useI18n();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.side}>
          <IconButton icon="back" label={t.back} onPress={goBack} isRTL={isRTL} flipForRTL />
        </View>
        <NovaText variant="heading" accessibilityRole="header" numberOfLines={1}>
          {title}
        </NovaText>
        <View style={styles.side} />
      </View>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>{children}</View>
        </ScrollView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** 角の丸い枠の中に、行を並べる（設定画面の一覧） */
export function Group({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

export const pageStyles = StyleSheet.create({
  column: { width: '100%', maxWidth: PAGE_WIDTH, alignSelf: 'center' },
});

const styles = StyleSheet.create({
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchDot: { width: 8, height: 8, borderRadius: 4 },
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    height: Layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  side: { width: 48 },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.xxxl },
  column: { width: '100%', maxWidth: PAGE_WIDTH, alignSelf: 'center', gap: Spacing.xxl },
  group: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowActive: { backgroundColor: Colors.surfaceRaised },
  rowOff: { opacity: 0.5 },
  rowLabel: { flex: 1 },
  rowValue: { maxWidth: '50%' },
});

/** 設定の1行（アイコン・名前・今の値・右向きの矢印） */
export function ListRow({
  icon,
  label,
  value,
  onPress,
  tone = 'primary',
  busy,
  disabled,
  first,
  chevron,
  selected,
  swatch,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  /** グループの最初の行（上に区切り線を引かない） */
  first?: boolean;
  /** 別の画面に進む行（右に矢印） */
  chevron?: boolean;
  /** 選ばれている行（右にチェック） */
  selected?: boolean;
  /** 行の先頭に出す色見本（外観の選択など） */
  swatch?: { background: string; accent: string };
}) {
  const { isRTL } = useI18n();
  const color = tone === 'danger' ? Colors.danger : Colors.text;
  const content = (
    <>
      {swatch ? (
        <View style={[styles.swatch, { backgroundColor: swatch.background }]}>
          <View style={[styles.swatchDot, { backgroundColor: swatch.accent }]} />
        </View>
      ) : null}
      {icon ? (
        <Icon
          name={icon}
          size={18}
          color={tone === 'danger' ? Colors.danger : Colors.textSecondary}
        />
      ) : null}
      <NovaText variant="body" style={[styles.rowLabel, { color }]} numberOfLines={1}>
        {label}
      </NovaText>
      {value ? (
        <NovaText variant="small" tone="secondary" numberOfLines={1} style={styles.rowValue}>
          {value}
        </NovaText>
      ) : null}
      {busy ? <ActivityIndicator color={Colors.textSecondary} /> : null}
      {chevron ? (
        <Icon name="forward" size={16} color={Colors.textMuted} isRTL={isRTL} flipForRTL />
      ) : null}
      {selected ? (
        <Icon name="check" size={18} color={Colors.accentText} strokeWidth={2.25} />
      ) : null}
    </>
  );
  if (!onPress) {
    return <View style={[styles.row, !first && styles.rowBorder]}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled || busy}
      style={(state) => [
        styles.row,
        !first && styles.rowBorder,
        isActive(state) && styles.rowActive,
        (disabled || busy) && styles.rowOff,
      ]}>
      {content}
    </Pressable>
  );
}
