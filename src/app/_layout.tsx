import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth';
import { Colors } from '@/constants/theme';
import { LanguageProvider } from '@/i18n';

/** 画面の切り替え方の設定。NOVAは常にダークテーマ。 */
const novaTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.background,
    text: Colors.text,
    border: Colors.border,
    primary: Colors.accent,
  },
};

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ThemeProvider value={novaTheme}>
          <StatusBar style="light" />
          <Screens />
        </ThemeProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

/**
 * ログインしているかどうかで、入れる画面を分ける。
 * - ログイン中：ホーム・チャット・プロフィール
 * - 未ログイン：ログイン・新規登録
 * - どちらでも：言語設定・ログイン後の戻り先
 */
function Screens() {
  const { loading, session, authRequired } = useAuth();
  const signedIn = !authRequired || Boolean(session);

  // ログイン状態を確認している間は、何も出さない（一瞬ログイン画面が見えるのを防ぐ）
  if (loading) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'NOVA AI' }} />
        <Stack.Screen name="chat" options={{ title: 'NOVA AI — Chat' }} />
        <Stack.Screen name="profile" options={{ title: 'NOVA AI — Profile' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ title: 'NOVA AI — Log in' }} />
        <Stack.Screen name="signup" options={{ title: 'NOVA AI — Sign up' }} />
      </Stack.Protected>
      <Stack.Screen name="language" options={{ title: 'NOVA AI — Language' }} />
      <Stack.Screen name="auth/callback" options={{ title: 'NOVA AI' }} />
    </Stack>
  );
}
