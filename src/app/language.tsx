import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NovaText } from '@/components/nova-text';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { type LanguagePreference, useI18n } from '@/i18n';
import { LANGUAGES } from '@/i18n/languages';
import { isActive } from '@/lib/pressable';

/** 言語設定画面：表示言語とNOVAの回答言語を別々に選ぶ */
export default function LanguageScreen() {
  const {
    t,
    isRTL,
    uiPreference,
    replyPreference,
    setUiPreference,
    setReplyPreference,
    needsRestart,
  } = useI18n();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={8}
          style={(state) => [styles.headerButton, isActive(state) && styles.rowActive]}>
          <NovaText variant="small" tone="secondary">
            {`${isRTL ? '›' : '‹'}  ${t.back}`}
          </NovaText>
        </Pressable>
        <NovaText variant="small" style={styles.headerTitle} accessibilityRole="header">
          {t.languageTitle}
        </NovaText>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          {needsRestart ? (
            <View style={styles.notice} accessibilityRole="alert">
              <NovaText variant="small" tone="accent">
                {t.restartNotice}
              </NovaText>
            </View>
          ) : null}

          <Section
            title={t.displayLanguage}
            hint={t.displayLanguageHint}
            autoLabel={t.autoDisplay}
            value={uiPreference}
            onChange={setUiPreference}
          />
          <Section
            title={t.replyLanguage}
            hint={t.replyLanguageHint}
            autoLabel={t.autoReply}
            value={replyPreference}
            onChange={setReplyPreference}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  hint,
  autoLabel,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  autoLabel: string;
  value: LanguagePreference;
  onChange: (v: LanguagePreference) => void;
}) {
  const options: { value: LanguagePreference; label: string; sub?: string }[] = [
    { value: 'auto', label: autoLabel },
    ...LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName, sub: l.englishName })),
  ];
  return (
    <View style={styles.section}>
      <NovaText variant="label" tone="muted">
        {title.toUpperCase()}
      </NovaText>
      <NovaText variant="small" tone="secondary">
        {hint}
      </NovaText>
      <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={title}>
        {options.map((o, i) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityLabel={o.label}
              style={(state) => [
                styles.row,
                i > 0 && styles.rowBorder,
                isActive(state) && styles.rowActive,
              ]}>
              <View style={styles.rowText}>
                <NovaText tone={selected ? 'primary' : 'secondary'}>{o.label}</NovaText>
                {o.sub && o.sub !== o.label ? (
                  <NovaText variant="caption" tone="muted">
                    {o.sub}
                  </NovaText>
                ) : null}
              </View>
              {selected ? (
                <NovaText tone="accent" style={styles.check}>
                  ✓
                </NovaText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    minWidth: 72,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  headerTitle: { fontWeight: '600' },
  scroll: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.xxl },
  notice: {
    borderWidth: 1,
    borderColor: Colors.accentMuted,
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  section: { gap: Spacing.sm },
  list: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 52,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowActive: { backgroundColor: Colors.surfaceRaised },
  rowText: { flex: 1, gap: 2 },
  check: { fontWeight: '700' },
});
