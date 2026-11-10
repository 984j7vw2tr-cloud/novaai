import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthFailure, type AuthErrorKind, useAuth } from '@/auth';
import { Button, Field, Notice } from '@/components/form';
import { NovaText } from '@/components/nova-text';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { getLanguage } from '@/i18n/languages';
import { authErrorMessage } from '@/lib/auth-messages';
import { isActive } from '@/lib/pressable';

/** プロフィール画面：メールアドレス・表示名・言語・ログアウト */
export default function ProfileScreen() {
  const { t, isRTL, uiLanguage } = useI18n();
  const { session, updateDisplayName, signOut } = useAuth();
  const user = session?.user;
  const initialName = (user?.user_metadata?.display_name as string | undefined) ?? '';
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState<null | 'save' | 'signout'>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<AuthErrorKind | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    setBusy('save');
    try {
      await updateDisplayName(name);
      setSaved(true);
    } catch (e) {
      setError(e instanceof AuthFailure ? e.kind : 'generic');
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    setBusy('signout');
    await signOut();
    // ログアウトすると、自動でログイン画面に切り替わる
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
          {t.profile}
        </NovaText>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={styles.section}>
            <NovaText variant="label" tone="muted">
              {t.signedInAs.toUpperCase()}
            </NovaText>
            <NovaText selectable>{user?.email ?? ''}</NovaText>
          </View>

          <View style={styles.section}>
            {error ? <Notice tone="danger" text={authErrorMessage(error, t)} /> : null}
            <Field
              label={t.displayName}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setSaved(false);
              }}
              maxLength={50}
              autoComplete="name"
              onSubmitEditing={save}
            />
            <Button
              label={saved ? t.saved : t.save}
              onPress={save}
              busy={busy === 'save'}
              disabled={!!busy || name.trim() === initialName.trim()}
            />
          </View>

          <Pressable
            onPress={() => router.push('/language')}
            accessibilityRole="button"
            accessibilityLabel={t.language}
            style={(state) => [styles.row, isActive(state) && styles.rowActive]}>
            <NovaText>{t.language}</NovaText>
            <NovaText tone="secondary">{getLanguage(uiLanguage).nativeName}</NovaText>
          </Pressable>

          <Button
            variant="secondary"
            label={t.signOut}
            onPress={logout}
            busy={busy === 'signout'}
            disabled={!!busy}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
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
  section: { gap: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    minHeight: 52,
  },
  rowActive: { backgroundColor: Colors.surfaceRaised },
});
