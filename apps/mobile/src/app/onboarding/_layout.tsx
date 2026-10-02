import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { OnboardingProvider, useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
}));

function WhenDraftLoaded({ children }: { children: ReactNode }) {
  const { loaded } = useOnboarding();
  const styles = useStyles();
  const theme = useTheme();
  if (!loaded) {
    return (
      <View style={styles.loading} testID="onboarding-loading">
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  return children;
}

/** The questionnaire after sign-up (spec section 3). Reachable only until onboarding is complete. */
export default function OnboardingLayout() {
  const { user } = useAuth();
  const theme = useTheme();
  if (!user) return null;
  return (
    <OnboardingProvider userId={user.id}>
      <WhenDraftLoaded>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
      </WhenDraftLoaded>
    </OnboardingProvider>
  );
}
