/** 小さな法的リンク：利用規約・プライバシーポリシー・特定商取引法に基づく表記 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { NovaText } from '@/components/nova-text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';

export function LegalLinks({
  align = 'center',
  tokushoho = true,
}: {
  align?: 'center' | 'start';
  /** 特定商取引法に基づく表記も出すか */
  tokushoho?: boolean;
}) {
  const { t } = useI18n();
  const links: { label: string; href: '/terms' | '/privacy' | '/tokushoho' }[] = [
    { label: t.termsTitle, href: '/terms' },
    { label: t.privacyTitle, href: '/privacy' },
    ...(tokushoho ? [{ label: t.legalNotice, href: '/tokushoho' as const }] : []),
  ];
  return (
    <View style={[styles.row, align === 'start' && styles.start]}>
      {links.map((l) => (
        <Pressable
          key={l.href}
          onPress={() => router.push(l.href)}
          accessibilityRole="link"
          hitSlop={6}
          style={styles.link}>
          <NovaText variant="caption" tone="muted" style={styles.underline}>
            {l.label}
          </NovaText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: Spacing.lg,
    rowGap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  start: { justifyContent: 'flex-start' },
  link: { paddingVertical: 2 },
  underline: { textDecorationLine: 'underline' },
});
