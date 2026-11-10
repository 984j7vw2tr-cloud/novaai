import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth';
import { Composer } from '@/components/composer';
import { NovaText } from '@/components/nova-text';
import { Wordmark } from '@/components/wordmark';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { getLanguage } from '@/i18n/languages';
import { isDemoMode } from '@/lib/config';
import { isActive } from '@/lib/pressable';

const BRAND_TAGLINE = 'ONE AI. EVERY LANGUAGE. NO FILTER.';

/** ホーム画面：最初の質問を入れると、チャット画面に移って回答が始まる */
export default function HomeScreen() {
  const [text, setText] = useState('');
  const { t, uiLanguage } = useI18n();
  const { authRequired } = useAuth();

  const startChat = (question: string) => {
    const q = question.trim();
    if (!q) return;
    setText('');
    router.push({ pathname: '/chat', params: { q } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        {authRequired ? (
          <Pressable
            onPress={() => router.push('/history')}
            accessibilityRole="button"
            accessibilityLabel={t.historyTitle}
            hitSlop={8}
            style={(state) => [styles.langButton, isActive(state) && styles.chipActive]}>
            <NovaText variant="caption" tone="secondary">
              {t.history}
            </NovaText>
          </Pressable>
        ) : null}
        {authRequired ? (
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel={t.profile}
            hitSlop={8}
            style={(state) => [styles.langButton, isActive(state) && styles.chipActive]}>
            <NovaText variant="caption" tone="secondary">
              {t.profile}
            </NovaText>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push('/language')}
          accessibilityRole="button"
          accessibilityLabel={t.language}
          hitSlop={8}
          style={(state) => [styles.langButton, isActive(state) && styles.chipActive]}>
          <NovaText variant="caption" tone="secondary">
            {getLanguage(uiLanguage).nativeName}
          </NovaText>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <View style={styles.hero}>
              <Wordmark size={52} />
              <NovaText variant="label" tone="muted" style={styles.tagline}>
                {BRAND_TAGLINE}
              </NovaText>
            </View>

            <View style={styles.headlineBlock}>
              <NovaText variant="title" style={styles.center}>
                {t.homeHeadline}
              </NovaText>
              <NovaText variant="small" tone="secondary" style={styles.center}>
                {t.homeSubline}
              </NovaText>
            </View>

            <Composer
              value={text}
              onChangeText={setText}
              onSubmit={() => startChat(text)}
              autoFocus={Platform.OS === 'web'}
            />

            <View style={styles.suggestions}>
              <NovaText variant="label" tone="muted">
                {t.suggestionsTitle}
              </NovaText>
              <View style={styles.chips}>
                {t.suggestions.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => startChat(s)}
                    accessibilityRole="button"
                    style={(state) => [styles.chip, isActive(state) && styles.chipActive]}>
                    <NovaText variant="small" tone="secondary">
                      {s}
                    </NovaText>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <NovaText variant="caption" tone="muted" style={styles.center}>
            {isDemoMode ? t.demoNotice : t.disclaimer}
          </NovaText>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.xxl },
  hero: { alignItems: 'center', gap: Spacing.lg },
  tagline: { textAlign: 'center' },
  headlineBlock: { gap: Spacing.sm },
  center: { textAlign: 'center' },
  suggestions: { gap: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  chipActive: { backgroundColor: Colors.surfaceRaised, borderColor: Colors.accentMuted },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  langButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  footer: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
});
