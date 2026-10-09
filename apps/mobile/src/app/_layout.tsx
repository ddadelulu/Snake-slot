import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthNoticeProvider } from '@/features/auth/AuthNotice';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { ConfigErrorScreen } from '@/features/config/ConfigErrorScreen';
import { StartupErrorScreen } from '@/features/config/StartupErrorScreen';
import { MomentWatcher } from '@/features/moments/MomentWatcher';
import { useAfterOnboarding } from '@/features/onboarding/afterOnboarding';
import { WidgetSync } from '@/features/widget/WidgetSync';
import { useProfile } from '@/data/profile';
import { LanguageProvider, ProfileLanguageSync, useLanguage } from '@/i18n';
import { readEnv } from '@/lib/env';
import { createQueryClient } from '@/lib/queryClient';
import { ThemeProvider, useAppearance } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [env] = useState(readEnv);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          {env.ok ? (
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <AuthNoticeProvider>
                  <AppNavigator />
                </AuthNoticeProvider>
              </AuthProvider>
            </QueryClientProvider>
          ) : (
            <ConfigErrorScreen problems={env.problems} />
          )}
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Which part of the app is reachable follows the auth state (expo-router protected routes):
 * signed out → sign-in screens; signed in but not set up → the onboarding questionnaire; set up →
 * the five tabs; signed in through a password reset link → only the new-password screen until a
 * new password is saved. The auth callback (deep links from emails and OAuth) is reachable in
 * every state.
 */
function AppNavigator() {
  const { status, isPasswordRecovery } = useAuth();
  const { theme, scheme, loaded: themeLoaded } = useAppearance();
  const { loaded: languageLoaded } = useLanguage();
  const profile = useProfile();
  const signedIn = status === 'signed_in';
  const profileKnown = !signedIn || profile.data !== undefined;
  const ready =
    status !== 'loading' && themeLoaded && languageLoaded && (profileKnown || profile.isError);
  const onboarded = profile.data?.onboarding_completed_at != null;
  // Right after onboarding: the destination chosen on its last steps (statement import).
  useAfterOnboarding(ready && signedIn && onboarded);

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme]);

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.accent,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.textPrimary,
        border: theme.colors.border,
        notification: theme.colors.statusDanger,
      },
    };
  }, [scheme, theme]);

  // The navigator mounts only once the auth state is known, so the URL the app was opened with
  // (a deep link, later a push notification) is resolved against the right guards instead of
  // being replaced by the sign-in screen while the stored session loads.
  if (ready && !profileKnown) {
    return <StartupErrorScreen onRetry={() => void profile.refetch()} />;
  }

  if (!ready) {
    return (
      <View
        style={[styles.loading, { backgroundColor: theme.colors.background }]}
        testID="app-loading"
      >
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {signedIn ? <ProfileLanguageSync /> : null}
      <WidgetSync />
      {signedIn && !isPasswordRecovery && onboarded ? <MomentWatcher /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Protected guard={signedIn && !isPasswordRecovery && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="transaction/[id]" />
          <Stack.Screen name="review" />
          <Stack.Screen name="import" />
          <Stack.Screen name="data-sources" />
          <Stack.Screen name="rules" />
          <Stack.Screen name="export" />
          <Stack.Screen
            name="moment"
            options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
          />
          <Stack.Screen name="alerts" />
          <Stack.Screen name="category/[id]" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="fixed-costs" />
          <Stack.Screen name="categories" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !isPasswordRecovery && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && isPasswordRecovery}>
          <Stack.Screen name="reset-password" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </NavigationThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
