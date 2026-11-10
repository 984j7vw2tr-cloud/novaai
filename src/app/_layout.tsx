import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';

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
    <ThemeProvider value={novaTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="index" options={{ title: 'NOVA AI' }} />
        <Stack.Screen name="chat" options={{ title: 'NOVA AI — Chat' }} />
      </Stack>
    </ThemeProvider>
  );
}
