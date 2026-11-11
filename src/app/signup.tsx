import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthFailure, type AuthErrorKind, useAuth } from '@/auth';
import { AuthScreen } from '@/components/auth-screen';
import { Button, Field, Notice } from '@/components/form';
import { NovaText } from '@/components/nova-text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { authErrorMessage, looksLikeEmail, withEmail } from '@/lib/auth-messages';

const MIN_PASSWORD = 8;

/** 新規登録画面 */
export default function SignupScreen() {
  const { t } = useI18n();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorKind | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async () => {
    if (!looksLikeEmail(email)) return setError('email');
    if (password.length < MIN_PASSWORD) return setError('weakPassword');
    setError(null);
    setBusy(true);
    try {
      const needsConfirm = await signUp(email, password, name);
      // 確認が要らない設定なら、そのままログイン状態になり、自動でホームへ移る
      if (needsConfirm) setSentTo(email.trim());
    } catch (e) {
      setError(e instanceof AuthFailure ? e.kind : 'generic');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen title={t.signupTitle}>
      {error ? <Notice tone="danger" text={authErrorMessage(error, t)} /> : null}
      {sentTo ? (
        <Notice tone="info" text={withEmail(t.confirmSent, sentTo)} />
      ) : (
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
            hint={t.passwordHint}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Field
            label={t.displayNameLabel}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            maxLength={50}
            onSubmitEditing={submit}
          />
          <Button label={t.signupButton} onPress={submit} busy={busy} />
        </View>
      )}

      <View style={styles.switchRow}>
        <NovaText variant="small" tone="secondary">
          {t.haveAccount}
        </NovaText>
        <Link href="/login" replace accessibilityRole="link">
          <NovaText variant="small" tone="accent" style={styles.link}>
            {t.login}
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
