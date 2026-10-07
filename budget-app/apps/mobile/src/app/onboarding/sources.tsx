import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Card, SwitchRow } from '@/components';
import { suggestsImport, wantsImportAfterSetup } from '@/features/onboarding/draft';
import { OnboardingScreen, goToNextStep } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.sm },
}));

/**
 * Step 9 (US-3.6, D-037): the ways to get transactions in that exist today. Importing a
 * statement right after setup is suggested for people who pay by card or phone; adding purchases
 * with "+" always works. Skipping means no import after setup.
 */
export default function SourcesStep() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { draft, update } = useOnboarding();
  const hint =
    draft.paymentMethods.length === 0
      ? undefined
      : suggestsImport(draft.paymentMethods)
        ? t('onboardingSources.suggestedCard')
        : t('onboardingSources.suggestedCash');

  return (
    <OnboardingScreen
      step="sources"
      title={t('onboardingSources.title')}
      message={t('onboardingSources.message')}
      onContinue={() => goToNextStep('sources')}
      onSkip={() => {
        update({ importAfterSetup: false });
        goToNextStep('sources');
      }}
    >
      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('onboardingSources.importTitle')}
        </AppText>
        <AppText tone="secondary">{t('onboardingSources.importBody')}</AppText>
        <Card padded={false}>
          <SwitchRow
            label={t('onboardingSources.importSwitch')}
            hint={hint}
            value={wantsImportAfterSetup(draft)}
            onValueChange={(importAfterSetup) => update({ importAfterSetup })}
            testID="onboarding-sources-import"
          />
        </Card>
        <AppText variant="caption" tone="secondary">
          {t('onboardingSources.later')}
        </AppText>
      </View>
      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('onboardingSources.manualTitle')}
        </AppText>
        <AppText tone="secondary">{t('onboardingSources.manualBody')}</AppText>
      </View>
    </OnboardingScreen>
  );
}
