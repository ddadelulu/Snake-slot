import { DEFAULT_CATEGORY_KEYS, type DefaultCategoryKey } from '@budget/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, ChipGroup, PrimaryButton, TextField, ToggleChip } from '@/components';
import {
  CUSTOM_CATEGORY_MAX_LENGTH,
  validateCategories,
  validateCustomCategory,
  type CategoryChoice,
  type ErrorCode,
} from '@/features/onboarding/draft';
import { OnboardingScreen, goToNextStep } from '@/features/onboarding/OnboardingScreen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.md },
}));

/** Defaults in their canonical order, then custom categories in the order they were added. */
function ordered(choices: CategoryChoice[]): CategoryChoice[] {
  const defaults = DEFAULT_CATEGORY_KEYS.filter((key) =>
    choices.some((choice) => choice.kind === 'default' && choice.key === key),
  ).map((key): CategoryChoice => ({ kind: 'default', key }));
  return [...defaults, ...choices.filter((choice) => choice.kind === 'custom')];
}

const CUSTOM_ERROR_KEY: Partial<
  Record<ErrorCode, 'onboarding.categories.duplicate' | 'onboarding.categories.tooLong'>
> = {
  category_duplicate: 'onboarding.categories.duplicate',
  category_too_long: 'onboarding.categories.tooLong',
};

export default function CategoriesStep() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { draft, update } = useOnboarding();
  const [submitted, setSubmitted] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customError, setCustomError] = useState<ErrorCode | null>(null);
  const { ok } = validateCategories(draft);

  const isSelected = (key: DefaultCategoryKey) =>
    draft.categories.some((choice) => choice.kind === 'default' && choice.key === key);
  const toggleDefault = (key: DefaultCategoryKey) =>
    update((current) => ({
      categories: ordered(
        isSelected(key)
          ? current.categories.filter(
              (choice) => !(choice.kind === 'default' && choice.key === key),
            )
          : [...current.categories, { kind: 'default', key }],
      ),
    }));
  const customs = draft.categories.filter(
    (choice): choice is Extract<CategoryChoice, { kind: 'custom' }> => choice.kind === 'custom',
  );

  const addCustom = () => {
    const name = customName.trim();
    if (name === '') return;
    const taken = [
      ...draft.categories.map((choice) =>
        choice.kind === 'default' ? t(`categories.${choice.key}`) : choice.name,
      ),
    ];
    const error = validateCustomCategory(name, taken);
    setCustomError(error);
    if (error) return;
    update((current) => ({
      categories: ordered([...current.categories, { kind: 'custom', name }]),
    }));
    setCustomName('');
  };

  const customErrorKey = customError ? CUSTOM_ERROR_KEY[customError] : undefined;

  return (
    <OnboardingScreen
      step="categories"
      title={t('onboarding.categories.title')}
      message={t('onboarding.categories.message')}
      onContinue={() => {
        setSubmitted(true);
        if (ok) goToNextStep('categories');
      }}
    >
      <ChipGroup accessibilityLabel={t('onboarding.categories.title')}>
        {DEFAULT_CATEGORY_KEYS.map((key) => (
          <ToggleChip
            key={key}
            label={t(`categories.${key}`)}
            selected={isSelected(key)}
            onToggle={() => toggleDefault(key)}
            testID={`onboarding-category-${key}`}
          />
        ))}
        {customs.map((choice) => (
          <ToggleChip
            key={`custom-${choice.name}`}
            label={choice.name}
            selected
            onToggle={() =>
              update((current) => ({
                categories: current.categories.filter((c) => c !== choice),
              }))
            }
            onRemove={() =>
              update((current) => ({
                categories: current.categories.filter((c) => c !== choice),
              }))
            }
            removeLabel={t('onboarding.categories.remove', { name: choice.name })}
            testID={`onboarding-category-custom-${choice.name}`}
          />
        ))}
      </ChipGroup>
      {submitted && !ok ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {t('onboarding.categories.required')}
        </AppText>
      ) : null}
      <View style={styles.section}>
        <TextField
          label={t('onboarding.categories.custom')}
          value={customName}
          onChangeText={(value) => {
            setCustomName(value);
            setCustomError(null);
          }}
          placeholder={t('onboarding.categories.customPlaceholder')}
          maxLength={CUSTOM_CATEGORY_MAX_LENGTH + 1}
          returnKeyType="done"
          onSubmitEditing={addCustom}
          error={customErrorKey ? t(customErrorKey) : undefined}
          testID="onboarding-custom-category"
        />
        <PrimaryButton
          variant="secondary"
          label={t('onboarding.categories.add')}
          onPress={addCustom}
          disabled={customName.trim() === ''}
          testID="onboarding-custom-category-add"
        />
      </View>
    </OnboardingScreen>
  );
}
