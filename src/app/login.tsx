import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthFailure, type AuthErrorKind, type OAuthProvider, useAuth } from '@/auth';
import { AuthScreen } from '@/components/auth-screen';
import { Button, Divider, Field, Notice } from '@/components/form';
import { NovaText } from '@/components/nova-text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { authErrorMessage, looksLikeEmail, withEmail } from '@/lib/auth-messages';

/** ログイン画面：メール＋パスワード / メールのリンク / Google / Apple */
export default function LoginScreen() {
  const { t } = useI18n();
  const { signInWithPassword, sendMagicLink, signInWithProvider, enabledProviders } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'password' | 'magic' | OAuthProvider>(null);
  const [error, setError] = useState<AuthErrorKind | null>(null);
  const [magicSentTo, setMagicSentTo] = useState<string | null>(null);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setError(null);
    setMagicSentTo(null);
    setBusy(kind);
    try {
      await action();
    } catch (e) {
      setError(e instanceof AuthFailure ? e.kind : 'generic');
    } finally {
      setBusy(null);
    }
  };

  const login = () => {
    if (!looksLikeEmail(email)) return setError('email');
    if (!password) return setError('invalid');
    run('password', () => signInWithPassword(email, password));
  };

  const magic = () => {
    if (!looksLikeEmail(email)) return setError('email');
    run('magic', async () => {
      await sendMagicLink(email);
      setMagicSentTo(email.trim());
    });
  };

  const showOAuth = enabledProviders.google || enabledProviders.apple;

  return (
    <AuthScreen title={t.loginTitle}>
      {error ? <Notice tone="danger" text={authErrorMessage(error, t)} /> : null}
      {magicSentTo ? <Notice tone="info" text={withEmail(t.magicLinkSent, magicSentTo)} /> : null}

      <View style={styles.form}>
        <Field
          label={t.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          inputMode="email"
        />
        <Field
          label={t.password}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={login}
        />
        <Button
          label={t.loginButton}
          onPress={login}
          busy={busy === 'password'}
          disabled={!!busy}
        />
      </View>

      <Divider label={t.or} />

      <View style={styles.form}>
        <Button
          variant="secondary"
          label={t.magicLinkButton}
          onPress={magic}
          busy={busy === 'magic'}
          disabled={!!busy}
        />
        {showOAuth && enabledProviders.google ? (
          <Button
            variant="secondary"
            label={t.continueWithGoogle}
            onPress={() => run('google', () => signInWithProvider('google'))}
            busy={busy === 'google'}
            disabled={!!busy}
          />
        ) : null}
        {showOAuth && enabledProviders.apple ? (
          <Button
            variant="secondary"
            label={t.continueWithApple}
            onPress={() => run('apple', () => signInWithProvider('apple'))}
            busy={busy === 'apple'}
            disabled={!!busy}
          />
        ) : null}
      </View>

      <View style={styles.switchRow}>
        <NovaText variant="small" tone="secondary">
          {t.noAccount}
        </NovaText>
        <Link href="/signup" replace accessibilityRole="link">
          <NovaText variant="small" tone="accent" style={styles.link}>
            {t.signup}
          </NovaText>
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.md },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  link: { textDecorationLine: 'underline' },
});
