import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { startGame } from '@/game/store';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  // The game loop (GPS, rivals, saving) lives outside any one screen so it keeps
  // running when you switch tabs.
  useEffect(() => {
    startGame();
  }, []);

  return (
    <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#f4f5f7' } }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
