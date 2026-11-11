import { Inter_300Light } from '@expo-google-fonts/inter/300Light';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth';
import { Colors } from '@/constants/theme';
import { LanguageProvider } from '@/i18n';

/** 画面の切り替え方の設定。Karakuchiは常にダークテーマ。 */
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
  // 文字のフォント（Inter・コード用の JetBrains Mono）を読み込む
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_400Regular,
  });
  // 読み込み中は背景だけ（文字がガタッと切り替わるのを防ぐ）。失敗したら標準のフォントで続ける
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

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
        <Stack.Screen name="index" options={{ title: 'Karakuchi AI' }} />
        <Stack.Screen name="chat" options={{ title: 'Karakuchi AI — Chat' }} />
        <Stack.Screen name="profile" options={{ title: 'Karakuchi AI — Profile' }} />
        <Stack.Screen name="history" options={{ title: 'Karakuchi AI — History' }} />
        <Stack.Screen name="plans" options={{ title: 'Karakuchi AI — Plans' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ title: 'Karakuchi AI — Log in' }} />
        <Stack.Screen name="signup" options={{ title: 'Karakuchi AI — Sign up' }} />
      </Stack.Protected>
      <Stack.Screen name="language" options={{ title: 'Karakuchi AI — Language' }} />
      <Stack.Screen name="auth/callback" options={{ title: 'Karakuchi AI' }} />
    </Stack>
  );
}
