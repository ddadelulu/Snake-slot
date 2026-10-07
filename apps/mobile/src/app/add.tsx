import { BASE_CURRENCY, localDateIn, type IngestRow, type LocalDate } from '@budget/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import {
  AlertBanner,
  AmountInput,
  AppText,
  BottomSheet,
  Card,
  ChoiceChips,
  ChoiceList,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SwitchRow,
  TextField,
  TextLink,
} from '@/components';
import { useCategories } from '@/data/categories';
import { useProfile } from '@/data/profile';
import { useAddTransactions, type AddRowResult, type DuplicateMatch } from '@/data/transactions';
import { categoryName } from '@/features/categories/categoryName';
import { parseAmountInput } from '@/features/transactions/amount';
import { transactionErrorCode, type TransactionErrorCode } from '@/features/transactions/errors';
import { formatShortWeekdayDate, formatWeekdayDate } from '@/features/transactions/format';
import { activeCategories, categoryTestKey } from '@/features/transactions/labels';
import { LookAlikeCard } from '@/features/transactions/LookAlikeCard';
import {
  MERCHANT_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  buildQuickAddRow,
  earlierDays,
  initialQuickAdd,
  setSplitting,
  type QuickAddForm,
} from '@/features/transactions/quickAdd';
import { SplitFields } from '@/features/transactions/SplitFields';
import { useLanguage } from '@/i18n';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.sm },
  loading: { paddingVertical: theme.spacing.lg, alignItems: 'flex-start' },
  sheetList: { flexGrow: 0, flexShrink: 1 },
}));

type DayOption = 'today' | 'yesterday' | 'other';

/** The row the database held back as a possible duplicate, and what it looks like. */
type LookAlike = { row: IngestRow; match: DuplicateMatch | null };

/**
 * Quick add (US-3.1), opened by "+" on Home and by batzen://add: the amount field has focus, the
 * categories are one tap away and Save stays above the keyboard. Amount, category, Save: done.
 * When the entry looks like a transaction already stored (D-040), the screen shows that one and
 * the person decides: "Add anyway" stores the same row again with `allow_duplicate`, "Don't add"
 * closes without storing.
 */
export default function AddScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { language } = useLanguage();
  const { data: profile } = useProfile();
  const categories = useCategories();
  const add = useAddTransactions();
  const [form, setForm] = useState<QuickAddForm>(initialQuickAdd);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<TransactionErrorCode | null>(null);
  const [notice, setNotice] = useState<'merged' | 'duplicate' | null>(null);
  const [lookAlike, setLookAlike] = useState<LookAlike | null>(null);
  const [pickingDay, setPickingDay] = useState(false);

  const timezone = profile?.timezone ?? 'Europe/Zurich';
  const today = localDateIn(new Date(), timezone);
  const days = earlierDays(today);
  const yesterday = days[0];
  const choices = activeCategories(categories.data ?? []);
  const check = buildQuickAddRow(form, new Date());
  const problems = attempted && !check.ok ? check.problems : {};
  const amount = parseAmountInput(form.amountText);

  const update = (change: Partial<QuickAddForm>) => {
    setError(null);
    setForm((current) => ({ ...current, ...change }));
  };

  const close = () => goBackOr('/');

  /** Sends one row; afterwards the screen closes, explains, or asks about a look-alike. */
  const send = async (row: IngestRow) => {
    setError(null);
    let result: AddRowResult | undefined;
    try {
      result = (await add.mutateAsync({ rows: [row] })).results[0];
    } catch (failure) {
      setError(transactionErrorCode(failure));
      return;
    }
    setLookAlike(null);
    if (result?.outcome === 'merged') setNotice('merged');
    else if (result?.outcome === 'possible_duplicate' && row.allow_duplicate !== true) {
      setLookAlike({ row, match: result.duplicateOf });
    } else if (result !== undefined && result.outcome !== 'added') setNotice('duplicate');
    else close();
  };

  const save = async () => {
    setAttempted(true);
    setError(null);
    const result = buildQuickAddRow(form, new Date());
    if (!result.ok || add.isPending) return;
    await send(result.row);
  };

  const addAnyway = async () => {
    if (!lookAlike || add.isPending) return;
    await send({ ...lookAlike.row, allow_duplicate: true });
  };

  const dayOption: DayOption =
    form.day.kind === 'today' ? 'today' : form.day.date === yesterday ? 'yesterday' : 'other';
  const otherDayLabel =
    form.day.kind === 'date' && dayOption === 'other'
      ? formatShortWeekdayDate(form.day.date, language)
      : t('quickAdd.otherDay');

  const chooseDay = (option: DayOption) => {
    if (option === 'today') update({ day: { kind: 'today' } });
    else if (option === 'yesterday' && yesterday)
      update({ day: { kind: 'date', date: yesterday } });
    else setPickingDay(true);
  };

  const errorBanner = error ? (
    <AlertBanner tone="danger" message={t(`transactionErrors.${error}`)} testID="add-error" />
  ) : null;

  const footer = notice ? (
    <PrimaryButton label={t('quickAdd.ok')} onPress={close} testID="add-done" />
  ) : lookAlike ? (
    <>
      {errorBanner}
      <PrimaryButton
        label={t('quickAdd.lookAlike.addAnyway')}
        onPress={() => void addAnyway()}
        loading={add.isPending}
        testID="add-duplicate-add-anyway"
      />
      <PrimaryButton
        variant="secondary"
        label={t('quickAdd.lookAlike.dontAdd')}
        onPress={close}
        disabled={add.isPending}
        testID="add-duplicate-cancel"
      />
    </>
  ) : (
    <>
      {errorBanner}
      <PrimaryButton
        label={t('quickAdd.save')}
        onPress={() => void save()}
        loading={add.isPending}
        testID="add-save"
      />
    </>
  );

  return (
    <Screen scroll footer={footer} testID="add-screen">
      <ScreenHeader backLabel={t('quickAdd.cancel')} onBack={close} testID="add-header" />
      <AppText variant="title" accessibilityRole="header">
        {t('quickAdd.title')}
      </AppText>

      {notice ? (
        <AlertBanner
          tone="info"
          title={t('quickAdd.alreadyTitle')}
          message={notice === 'merged' ? t('quickAdd.merged') : t('quickAdd.duplicate')}
          testID="add-merged"
        />
      ) : lookAlike ? (
        <LookAlikeCard match={lookAlike.match} timeZone={timezone} testID="add-duplicate" />
      ) : (
        <>
          <AmountInput
            label={t('quickAdd.amount')}
            currency={BASE_CURRENCY}
            value={form.amountText}
            onChangeText={(amountText) => update({ amountText })}
            size="large"
            autoFocus
            error={
              problems.amount === 'required'
                ? t('quickAdd.amountRequired')
                : problems.amount === 'invalid'
                  ? t('quickAdd.amountInvalid')
                  : undefined
            }
            testID="add-amount"
          />

          <View style={styles.section}>
            {form.splitting ? (
              <SplitFields
                totalAbs={amount.ok ? amount.rappen : null}
                parts={form.parts}
                onChange={(parts) => update({ parts })}
                categories={choices}
                problem={problems.split}
                partProblems={problems.parts}
                testID="add-split-editor"
              />
            ) : (
              <>
                <AppText variant="label">{t('quickAdd.category')}</AppText>
                {categories.isPending ? (
                  <View style={styles.loading}>
                    <ActivityIndicator
                      color={theme.colors.accent}
                      accessibilityLabel={t('quickAdd.categoriesLoading')}
                    />
                  </View>
                ) : categories.isError ? (
                  <AlertBanner
                    tone="danger"
                    message={t('quickAdd.categoriesError')}
                    actionLabel={t('transactions.retry')}
                    onAction={() => void categories.refetch()}
                    testID="add-categories-error"
                  />
                ) : (
                  <ChoiceChips
                    options={choices.map((category) => ({
                      value: category.id,
                      label: categoryName(category, t),
                      testID: `add-category-${categoryTestKey(category)}`,
                    }))}
                    selected={form.categoryId}
                    onSelect={(categoryId) => update({ categoryId })}
                    accessibilityLabel={t('quickAdd.category')}
                    size="large"
                    testID="add-categories"
                  />
                )}
                {problems.category ? (
                  <AppText
                    variant="caption"
                    tone="danger"
                    accessibilityLiveRegion="polite"
                    testID="add-category-error"
                  >
                    {t('quickAdd.categoryRequired')}
                  </AppText>
                ) : null}
              </>
            )}
            <TextLink
              label={form.splitting ? t('quickAdd.splitOff') : t('quickAdd.split')}
              onPress={() => {
                setError(null);
                setForm((current) => setSplitting(current, !current.splitting));
              }}
              testID="add-split"
            />
          </View>

          <View style={styles.section}>
            <AppText variant="heading" accessibilityRole="header">
              {t('quickAdd.details')}
            </AppText>
            <Card padded={false}>
              <SwitchRow
                label={t('quickAdd.moneyIn')}
                hint={t('quickAdd.moneyInHint')}
                value={form.moneyIn}
                onValueChange={(moneyIn) => update({ moneyIn })}
                testID="add-money-in"
              />
            </Card>
            <TextField
              label={t('quickAdd.merchant')}
              value={form.merchant}
              onChangeText={(merchant) => update({ merchant })}
              placeholder={t('quickAdd.merchantPlaceholder')}
              maxLength={MERCHANT_MAX_LENGTH}
              autoCapitalize="words"
              testID="add-merchant"
            />
            <TextField
              label={t('quickAdd.note')}
              value={form.note}
              onChangeText={(note) => update({ note })}
              placeholder={t('quickAdd.notePlaceholder')}
              maxLength={NOTE_MAX_LENGTH}
              testID="add-note"
            />
            <AppText variant="label">{t('quickAdd.day')}</AppText>
            <ChoiceChips<DayOption>
              options={[
                { value: 'today', label: t('quickAdd.today') },
                { value: 'yesterday', label: t('quickAdd.yesterday') },
                { value: 'other', label: otherDayLabel },
              ]}
              selected={dayOption}
              onSelect={chooseDay}
              accessibilityLabel={t('quickAdd.day')}
              testID="add-day"
            />
          </View>
        </>
      )}

      <BottomSheet
        visible={pickingDay}
        onClose={() => setPickingDay(false)}
        title={t('quickAdd.dayTitle')}
        closeLabel={t('common.close')}
        testID="add-day-sheet"
      >
        <ScrollView style={styles.sheetList}>
          <ChoiceList<LocalDate>
            options={days.map((date) => ({
              value: date,
              label:
                date === yesterday ? t('quickAdd.yesterday') : formatWeekdayDate(date, language),
            }))}
            selected={form.day.kind === 'date' ? form.day.date : null}
            onSelect={(date) => {
              update({ day: { kind: 'date', date } });
              setPickingDay(false);
            }}
            accessibilityLabel={t('quickAdd.dayTitle')}
            testID="add-day-option"
          />
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}
