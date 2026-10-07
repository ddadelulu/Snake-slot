import { LANGUAGES, type Language } from '@budget/core';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AlertBanner, AppText, Card, ChoiceList, Divider, Screen, SettingsRow } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { signOut } from '@/features/auth/authApi';
import { DeleteAccountSheet } from '@/features/settings/DeleteAccountSheet';
import { useLanguage } from '@/i18n';
import { readEnv } from '@/lib/env';
import {
  APPEARANCE_PREFERENCES,
  makeStyles,
  useAppearance,
  type AppearancePreference,
} from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.sm },
}));

export default function SettingsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { preference, setPreference } = useAppearance();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const env = readEnv();
  const version = Constants.expoConfig?.version ?? '';

  const languageOptions = LANGUAGES.map((value) => ({ value, label: t(`languageNames.${value}`) }));
  const appearanceOptions = APPEARANCE_PREFERENCES.map((value) => ({
    value,
    label: t(`settings.appearanceOptions.${value}`),
  }));

  const handleSignOut = async () => {
    setSignOutFailed(false);
    const result = await signOut();
    if (!result.ok) setSignOutFailed(true);
  };

  return (
    <Screen
      title={t('settings.title')}
      scroll
      edges={['top', 'left', 'right']}
      testID="settings-screen"
    >
      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('settings.account')}
        </AppText>
        {signOutFailed ? <AlertBanner tone="danger" message={t('settings.signOutFailed')} /> : null}
        <Card>
          <AppText variant="label" tone="secondary">
            {t('settings.signedInAs')}
          </AppText>
          <AppText numberOfLines={1} ellipsizeMode="middle" testID="settings-email">
            {user?.email ?? ''}
          </AppText>
        </Card>
        <Card padded={false}>
          <SettingsRow
            label={t('settings.signOut')}
            onPress={() => void handleSignOut()}
            navigates={false}
            testID="settings-sign-out"
          />
          <Divider inset />
          <SettingsRow
            label={t('settings.deleteAccount')}
            onPress={() => setDeleteOpen(true)}
            destructive
            testID="settings-delete-account"
          />
        </Card>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('dataSources.settingsSection')}
        </AppText>
        <Card padded={false}>
          <SettingsRow
            label={t('dataSources.settingsRow')}
            onPress={() => router.push('/data-sources')}
            testID="settings-data-sources"
          />
          <Divider inset />
          <SettingsRow
            label={t('rules.settingsRow')}
            onPress={() => router.push('/rules')}
            testID="settings-rules"
          />
          <Divider inset />
          <SettingsRow
            label={t('dataExport.settingsRow')}
            onPress={() => router.push('/export')}
            testID="settings-export"
          />
        </Card>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('settings.preferences')}
        </AppText>
        <AppText variant="label" tone="secondary">
          {t('settings.language')}
        </AppText>
        <ChoiceList<Language>
          options={languageOptions}
          selected={language}
          onSelect={(value) => void setLanguage(value)}
          accessibilityLabel={t('settings.language')}
          testID="settings-language"
        />
        <AppText variant="label" tone="secondary">
          {t('settings.appearance')}
        </AppText>
        <ChoiceList<AppearancePreference>
          options={appearanceOptions}
          selected={preference}
          onSelect={(value) => void setPreference(value)}
          accessibilityLabel={t('settings.appearance')}
          testID="settings-appearance"
        />
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('settings.about')}
        </AppText>
        <AppText tone="secondary">{t('common.version', { version })}</AppText>
        {env.ok && env.appEnv !== 'production' ? (
          <AppText tone="secondary">
            {t('settings.environment', { environment: env.appEnv })}
          </AppText>
        ) : null}
      </View>

      <DeleteAccountSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </Screen>
  );
}
