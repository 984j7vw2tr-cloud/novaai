import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AuthErrorKind, useAuth } from '@/auth';
import { Button, Field, Notice } from '@/components/form';
import { NovaText } from '@/components/nova-text';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { getLanguage } from '@/i18n/languages';
import { authErrorMessage } from '@/lib/auth-messages';
import { isActive } from '@/lib/pressable';
import { getProfile, updateProfile } from '@/lib/profile';
import { deleteMyAccount } from '@/lib/account';
import { confirmAsync } from '@/lib/confirm';
import { deleteAllConversations } from '@/lib/conversations';

/** プロフィール画面：メールアドレス・表示名・言語・ログアウト */
export default function ProfileScreen() {
  const { t, isRTL, uiLanguage } = useI18n();
  const { session, signOut } = useAuth();
  const user = session?.user;
  const userId = user?.id;
  /** データベースに保存されている表示名（変更があるかの判定に使う） */
  const [savedName, setSavedName] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'signout' | 'history' | 'account'>(null);
  /** データ削除の結果（成功・失敗のお知らせ） */
  const [dataNotice, setDataNotice] = useState<null | 'historyDeleted' | 'failed'>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<AuthErrorKind | null>(null);

  // プロフィール（profiles の表）から表示名を読む
  useEffect(() => {
    if (!userId) return;
    let active = true;
    getProfile(userId)
      .then((p) => {
        if (!active || !p) return;
        setSavedName(p.displayName);
        setName(p.displayName);
      })
      .catch(() => {
        if (active) setError('generic');
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    setBusy('save');
    try {
      if (userId) await updateProfile(userId, { displayName: name });
      setSavedName(name.trim());
      setSaved(true);
    } catch {
      setError('generic');
    } finally {
      setBusy(null);
    }
  };

  const deleteHistory = async () => {
    if (!userId) return;
    const ok = await confirmAsync({
      message: t.deleteAllHistoryConfirm,
      confirmLabel: t.deleteLabel,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    setDataNotice(null);
    setBusy('history');
    try {
      await deleteAllConversations(userId);
      setDataNotice('historyDeleted');
    } catch {
      setDataNotice('failed');
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    const ok = await confirmAsync({
      message: t.deleteAccountConfirm,
      confirmLabel: t.deleteLabel,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    setDataNotice(null);
    setBusy('account');
    try {
      await deleteMyAccount();
      // ログイン状態が消えるので、自動でログイン画面に切り替わる
    } catch {
      setDataNotice('failed');
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
              disabled={!!busy || name.trim() === savedName.trim()}
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

          {/* データ：会話履歴の削除・アカウントの削除 */}
          <View style={styles.section}>
            <NovaText variant="label" tone="muted">
              {t.dataSection.toUpperCase()}
            </NovaText>
            {dataNotice ? (
              <Notice
                tone={dataNotice === 'failed' ? 'danger' : 'info'}
                text={dataNotice === 'failed' ? t.actionFailed : t.historyDeleted}
              />
            ) : null}
            <Button
              variant="secondary"
              label={t.deleteAllHistory}
              onPress={deleteHistory}
              busy={busy === 'history'}
              disabled={!!busy}
            />
            <Button
              variant="danger"
              label={t.deleteAccount}
              onPress={deleteAccount}
              busy={busy === 'account'}
              disabled={!!busy}
            />
          </View>
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
