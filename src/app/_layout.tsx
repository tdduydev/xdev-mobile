import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ContentProvider } from '@/state/content';
import { LocaleProvider } from '@/state/locale';
import { ThemeModeProvider } from '@/state/theme';

SplashScreen.preventAutoHideAsync();

function RootNavigation() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="post/[slug]"
          options={{
            headerShown: true,
            headerTitle: '',
          }}
        />
        <Stack.Screen
          name="quiz/[slug]"
          options={{
            headerShown: true,
            headerTitle: '',
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeModeProvider>
      <LocaleProvider>
        <ContentProvider>
          <RootNavigation />
        </ContentProvider>
      </LocaleProvider>
    </ThemeModeProvider>
  );
}
