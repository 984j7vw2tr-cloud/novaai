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

import { Composer } from '@/components/composer';
import { NovaText } from '@/components/nova-text';
import { Wordmark } from '@/components/wordmark';
import { strings } from '@/constants/strings';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { isActive } from '@/lib/pressable';

/** ホーム画面：最初の質問を入れると、チャット画面に移って回答が始まる */
export default function HomeScreen() {
  const [text, setText] = useState('');

  const startChat = (question: string) => {
    const q = question.trim();
    if (!q) return;
    setText('');
    router.push({ pathname: '/chat', params: { q } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
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
                {strings.brandTagline}
              </NovaText>
            </View>

            <View style={styles.headlineBlock}>
              <NovaText variant="title" style={styles.center}>
                {strings.homeHeadline}
              </NovaText>
              <NovaText variant="small" tone="secondary" style={styles.center}>
                {strings.homeSubline}
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
                {strings.suggestionsTitle}
              </NovaText>
              <View style={styles.chips}>
                {strings.suggestions.map((s) => (
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
            {strings.demoNotice}
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
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.xxl,
  },
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
  footer: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
});
