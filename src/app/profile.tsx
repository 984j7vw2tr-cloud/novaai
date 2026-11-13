import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type AuthErrorKind, useAuth } from '@/auth';
import { Button, Field, Notice, Section } from '@/components/form';
import { NovaText } from '@/components/nova-text';
import { Group, ListRow, PageScreen } from '@/components/page-screen';
import { useI18n } from '@/i18n';
import { getLanguage } from '@/i18n/languages';
import { authErrorMessage } from '@/lib/auth-messages';
import { getProfile, updateProfile } from '@/lib/profile';
import { deleteMyAccount } from '@/lib/account';
import { getBillingStatus } from '@/lib/billing';
import { Spacing, THEME_NAMES, type ThemeName } from '@/constants/theme';
import { setTheme, useTheme } from '@/lib/theme-store';
import { confirmAsync } from '@/lib/confirm';
import { deleteAllConversations } from '@/lib/conversations';

/** 設定画面：アカウント（メールアドレス・表示名）・言語・データ（履歴とアカウントの削除）・ログアウト */
export default function ProfileScreen() {
  const { t, uiLanguage } = useI18n();
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
  const theme = useTheme();
  /** 外観の選択肢を開いているか */
  const [themeOpen, setThemeOpen] = useState(false);
  const themeLabel: Record<ThemeName, string> = {
    dark: t.themeDark,
    light: t.themeLight,
    green: t.themeGreen,
    purple: t.themePurple,
    pink: t.themePink,
  };
  /** 今のプラン（FREE / PLUS / PRO） */
  const [planLabel, setPlanLabel] = useState('');

  useEffect(() => {
    let active = true;
    getBillingStatus()
      .then((s) => {
        if (active) setPlanLabel(s.plan === 'free' ? 'FREE' : 'PLUS');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
    <PageScreen title={t.settings}>
      {/* アカウント */}
      <Section title={t.account}>
        <Group>
          <ListRow first label={t.signedInAs} value={user?.email ?? ''} />
        </Group>
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
        <View style={styles.saveRow}>
          <Button
            label={saved ? t.saved : t.save}
            onPress={save}
            busy={busy === 'save'}
            disabled={!!busy || name.trim() === savedName.trim()}
          />
        </View>
      </Section>

      {/* 料金プラン */}
      <Section title={t.plans}>
        <Group>
          <ListRow
            first
            icon="plan"
            label={t.plans}
            value={planLabel}
            onPress={() => router.push('/plans')}
            chevron
          />
        </Group>
      </Section>

      {/* NAYQOの記憶（覚えたこと・宿題） */}
      <Section title={t.memoryTitle}>
        <Group>
          <ListRow
            first
            icon="memory"
            label={t.memoryTitle}
            onPress={() => router.push('/memory')}
            chevron
          />
        </Group>
      </Section>

      {/* 外観（テーマ） */}
      {/* 「外観」を押したときだけ、選択肢を開く（選んでいるものに✓） */}
      <Section title={t.appearance}>
        <Group>
          <ListRow
            first
            label={t.appearance}
            value={themeLabel[theme]}
            onPress={() => setThemeOpen((v) => !v)}
            chevron
          />
          {themeOpen
            ? THEME_NAMES.map((name) => (
                <ListRow
                  key={name}
                  label={themeLabel[name]}
                  selected={theme === name}
                  onPress={() => setTheme(name)}
                />
              ))
            : null}
        </Group>
      </Section>

      {/* 言語 */}
      <Section title={t.language}>
        <Group>
          <ListRow
            first
            icon="language"
            label={t.language}
            value={getLanguage(uiLanguage).nativeName}
            onPress={() => router.push('/language')}
            chevron
          />
        </Group>
      </Section>

      {/* データ：会話履歴の削除・アカウントの削除 */}
      <Section title={t.dataSection}>
        {dataNotice ? (
          <Notice
            tone={dataNotice === 'failed' ? 'danger' : 'info'}
            text={dataNotice === 'failed' ? t.actionFailed : t.historyDeleted}
          />
        ) : null}
        <Group>
          <ListRow
            first
            icon="history"
            label={t.viewAllHistory}
            onPress={() => router.push('/history')}
            chevron
          />
          <ListRow
            icon="trash"
            label={t.deleteAllHistory}
            onPress={deleteHistory}
            busy={busy === 'history'}
            disabled={!!busy}
          />
          <ListRow
            icon="trash"
            tone="danger"
            label={t.deleteAccount}
            onPress={deleteAccount}
            busy={busy === 'account'}
            disabled={!!busy}
          />
        </Group>
      </Section>

      <Button
        variant="secondary"
        icon="logout"
        label={t.signOut}
        onPress={logout}
        busy={busy === 'signout'}
        disabled={!!busy}
      />

      {/* いちばん下に小さく：特定商取引法に基づく表記 */}
      <Pressable
        onPress={() => router.push('/tokushoho')}
        accessibilityRole="link"
        style={styles.legal}>
        <NovaText variant="caption" tone="muted" style={styles.legalText}>
          {t.legalNotice}
        </NovaText>
      </Pressable>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  saveRow: { alignItems: 'flex-end' },
  legal: { alignSelf: 'center', paddingVertical: Spacing.sm, marginTop: Spacing.md },
  legalText: { textDecorationLine: 'underline' },
});
