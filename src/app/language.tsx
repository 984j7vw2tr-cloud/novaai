import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icons';
import { NovaText } from '@/components/nova-text';
import { PageScreen } from '@/components/page-screen';
import { Colors, Spacing } from '@/constants/theme';
import { type LanguagePreference, useI18n } from '@/i18n';
import { LANGUAGES } from '@/i18n/languages';
import { isActive } from '@/lib/pressable';
import { updateProfile } from '@/lib/profile';

/** 言語設定画面：表示言語とNOVAの回答言語を別々に選ぶ */
export default function LanguageScreen() {
  const { t, uiPreference, replyPreference, setUiPreference, setReplyPreference, needsRestart } =
    useI18n();
  const { session } = useAuth();
  const userId = session?.user.id;

  // 表示言語を変えたら、ログイン中ならプロフィールにも保存する（失敗しても画面の切り替えは行う）
  const changeUiLanguage = (p: LanguagePreference) => {
    setUiPreference(p);
    if (userId) updateProfile(userId, { preferredLanguage: p }).catch(() => {});
  };

  return (
    <PageScreen title={t.languageTitle}>
      {needsRestart ? <Notice tone="info" text={t.restartNotice} /> : null}
      <LanguageSection
        title={t.displayLanguage}
        hint={t.displayLanguageHint}
        autoLabel={t.autoDisplay}
        value={uiPreference}
        onChange={changeUiLanguage}
      />
      <LanguageSection
        title={t.replyLanguage}
        hint={t.replyLanguageHint}
        autoLabel={t.autoReply}
        value={replyPreference}
        onChange={setReplyPreference}
      />
    </PageScreen>
  );
}

function LanguageSection({
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
      <NovaText variant="label" tone="muted" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </NovaText>
      <NovaText variant="small" tone="secondary" style={styles.sectionTitle}>
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
                <NovaText
                  variant={selected ? 'bodyMedium' : 'body'}
                  tone={selected ? 'primary' : 'secondary'}>
                  {o.label}
                </NovaText>
                {o.sub && o.sub !== o.label ? (
                  <NovaText variant="caption" tone="muted">
                    {o.sub}
                  </NovaText>
                ) : null}
              </View>
              {selected ? (
                <Icon name="check" size={18} color={Colors.text} strokeWidth={2.25} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  sectionTitle: { paddingHorizontal: Spacing.xs },
  list: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md - 2,
    minHeight: 52,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowActive: { backgroundColor: Colors.surfaceRaised },
  rowText: { flex: 1, gap: 1 },
});
