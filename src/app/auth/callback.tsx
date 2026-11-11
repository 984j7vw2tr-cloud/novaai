import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth';
import { Button } from '@/components/form';
import { NovaText } from '@/components/nova-text';
import { Colors, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';

/** この時間を過ぎてもログインできなければ、失敗として案内する */
const TIMEOUT_MS = 10000;

/**
 * メールのリンクや Google/Apple のログインから戻ってくる画面。
 * ログインの完了処理は自動で行われる（Web：Supabaseが URL を読む、スマホ：AuthProvider）。
 */
export default function AuthCallbackScreen() {
  const { t } = useI18n();
  const { session, loading } = useAuth();
  const params = useLocalSearchParams<{ error?: string; error_description?: string }>();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (session) router.replace('/');
  }, [session]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const failed = Boolean(params.error) || (timedOut && !loading && !session);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        {failed ? (
          <>
            <NovaText style={styles.text} accessibilityRole="alert">
              {t.callbackFailed}
            </NovaText>
            <Button label={t.backToLogin} onPress={() => router.replace('/login')} />
          </>
        ) : (
          <>
            <ActivityIndicator color={Colors.accent} />
            <NovaText tone="secondary" style={styles.text}>
              {t.callbackWorking}
            </NovaText>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  text: { textAlign: 'center' },
});
