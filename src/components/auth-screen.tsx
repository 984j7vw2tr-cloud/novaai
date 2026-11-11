/** ログイン・登録画面の共通の枠（ロゴ・言語ボタン・中央寄せ） */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NovaText } from '@/components/nova-text';
import { Icon } from '@/components/icons';
import { BrandMark } from '@/components/wordmark';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { getLanguage } from '@/i18n/languages';
import { isActive } from '@/lib/pressable';

/** ログイン画面のフォームは、読みやすい幅に収める */
const FORM_WIDTH = 420;

export function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  const { t, uiLanguage } = useI18n();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.push('/language')}
          accessibilityRole="button"
          accessibilityLabel={t.language}
          hitSlop={8}
          style={(state) => [styles.langButton, isActive(state) && styles.langButtonActive]}>
          <Icon name="language" size={16} color={Colors.textSecondary} />
          <NovaText variant="small" tone="secondary">
            {getLanguage(uiLanguage).nativeName}
          </NovaText>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <View style={styles.hero}>
              <BrandMark size={34} />
              <NovaText variant="display" style={styles.center} accessibilityRole="header">
                {title}
              </NovaText>
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  langButtonActive: { backgroundColor: Colors.surfaceRaised },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  column: { width: '100%', maxWidth: FORM_WIDTH, alignSelf: 'center', gap: Spacing.xl },
  hero: { alignItems: 'center', gap: Spacing.lg + 4, marginBottom: Spacing.md },
  center: { textAlign: 'center' },
});
