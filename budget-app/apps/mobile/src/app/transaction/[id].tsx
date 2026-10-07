import {
  BASE_CURRENCY,
  addDays,
  compareLocalDates,
  formatChf,
  localDateIn,
  type LocalDate,
} from '@budget/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import {
  AlertBanner,
  AmountInput,
  AppText,
  BottomSheet,
  Card,
  ChoiceList,
  Divider,
  EmptyState,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SettingsRow,
  Stepper,
  TextField,
  UndoBar,
} from '@/components';
import { useCategories } from '@/data/categories';
import { useFixedCosts } from '@/data/fixedCosts';
import { useProfile } from '@/data/profile';
import {
  useSetTransactionSplits,
  useTransaction,
  useUpdateTransaction,
  type RulePatch,
  type TransactionItem,
  type TransactionPatch,
  type UpdateResult,
} from '@/data/transactions';
import { categoryName } from '@/features/categories/categoryName';
import { parseAmountInput, rappenToInput } from '@/features/transactions/amount';
import { transactionErrorCode, type TransactionErrorCode } from '@/features/transactions/errors';
import {
  formatWeekdayDate,
  instantAt,
  localDayOf,
  localTimeOf,
} from '@/features/transactions/format';
import {
  activeCategories,
  categoryTestKey,
  fixedCostName,
  placementLabel,
  toLookups,
} from '@/features/transactions/labels';
import { MERCHANT_MAX_LENGTH, NOTE_MAX_LENGTH } from '@/features/transactions/quickAdd';
import { RuleQuestion } from '@/features/transactions/RuleQuestion';
import { rulePromptFor } from '@/features/transactions/rulePrompt';
import {
  checkSplit,
  partsFromSplits,
  startSplit,
  type SplitCheck,
  type SplitDraftPart,
} from '@/features/transactions/split';
import { SplitFields } from '@/features/transactions/SplitFields';
import { TransactionFacts } from '@/features/transactions/TransactionFacts';
import { useLanguage } from '@/i18n';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxxl,
  },
  section: { gap: theme.spacing.sm },
  buttons: { gap: theme.spacing.md },
  sheetBody: { gap: theme.spacing.lg },
  sheetScroll: { flexGrow: 0 },
}));

const NONE = '__none__';

const leave = () => goBackOr('/transactions');

/** US-3.4: one transaction with everything known about it, and every change the person may make. */
export default function TransactionDetailScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useTransaction(typeof id === 'string' ? id : undefined);

  return (
    <Screen scroll testID="detail-screen">
      <ScreenHeader backLabel={t('transactionDetail.back')} onBack={leave} testID="detail-header" />
      {query.data === undefined ? (
        query.isError ? (
          <EmptyState
            title={t('transactionDetail.loadError')}
            message={t('transactions.loadErrorMessage')}
            actionLabel={t('transactions.retry')}
            onAction={() => void query.refetch()}
            testID="detail-load-error"
          />
        ) : (
          <View style={styles.loading} testID="detail-loading">
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        )
      ) : query.data === null ? (
        <EmptyState
          title={t('transactionDetail.notFoundTitle')}
          message={t('transactionDetail.notFoundMessage')}
          actionLabel={t('transactionDetail.leave')}
          onAction={leave}
          testID="detail-not-found"
        />
      ) : (
        <Detail transaction={query.data} />
      )}
    </Screen>
  );
}

type Saving =
  | 'category'
  | 'rule-yes'
  | 'rule-no'
  | 'fixed-cost'
  | 'merchant'
  | 'note'
  | 'manual'
  | 'split'
  | 'split-remove'
  | 'delete'
  | 'restore';

type Sheet = 'category' | 'fixed-cost' | 'delete';

function Detail({ transaction }: { transaction: TransactionItem }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { language } = useLanguage();
  const { data: profile } = useProfile();
  const categories = useCategories();
  const fixedCosts = useFixedCosts();
  const update = useUpdateTransaction();
  const setSplits = useSetTransactionSplits();
  const timeZone = profile?.timezone ?? 'Europe/Zurich';
  const lookups = toLookups(categories.data, fixedCosts.data);

  const [saving, setSaving] = useState<Saving | null>(null);
  const [error, setError] = useState<TransactionErrorCode | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [ruleOffer, setRuleOffer] = useState<{ categoryId: string; rule: RulePatch } | null>(null);
  const [ruleDone, setRuleDone] = useState<{
    count: number;
    pattern: string;
    categoryId: string;
  } | null>(null);
  const [splitParts, setSplitParts] = useState<SplitDraftPart[] | null>(null);
  const [splitCheck, setSplitCheck] = useState<SplitCheck | null>(null);
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [note, setNote] = useState(transaction.note ?? '');
  const [amountText, setAmountText] = useState(rappenToInput(transaction.amountRappen));
  const [day, setDay] = useState<LocalDate>(localDayOf(transaction.bookedAt, timeZone));
  const [justDeleted, setJustDeleted] = useState(false);
  const [restored, setRestored] = useState(false);

  const busy = saving !== null;
  const sign = transaction.amountRappen > 0 ? 1 : -1;
  const totalAbs = Math.abs(transaction.amountRappen);
  const isSplit = transaction.splits.length > 0;
  const deleted = transaction.deletedAt !== null;
  const choices = activeCategories(categories.data ?? []);
  const nameOf = (categoryId: string) => {
    const category = lookups.categories.get(categoryId);
    return category ? categoryName(category, t) : '';
  };

  /** Runs one change; on failure the message shows and whatever was typed stays. */
  async function run(action: Saving, patch: TransactionPatch): Promise<UpdateResult | null> {
    setSaving(action);
    setError(null);
    try {
      return await update.mutateAsync({ id: transaction.id, patch });
    } catch (failure) {
      setError(transactionErrorCode(failure));
      return null;
    } finally {
      setSaving(null);
    }
  }

  const chooseCategory = (value: string) => {
    setSheet(null);
    setRuleDone(null);
    const categoryId = value === NONE ? null : value;
    const rule = rulePromptFor(categoryId, transaction);
    if (categoryId !== null && rule !== null) {
      setRuleOffer({ categoryId, rule });
      return;
    }
    setRuleOffer(null);
    void run('category', { categoryId });
  };

  const answerRule = async (always: boolean) => {
    if (!ruleOffer) return;
    const { categoryId, rule } = ruleOffer;
    const result = await run(
      always ? 'rule-yes' : 'rule-no',
      always ? { categoryId, rule } : { categoryId },
    );
    if (!result) return;
    setRuleOffer(null);
    if (always)
      setRuleDone({ count: result.recategorizedCount, pattern: rule.pattern, categoryId });
  };

  const saveSplit = async () => {
    if (!splitParts) return;
    const check = checkSplit(totalAbs, sign, splitParts);
    setSplitCheck(check);
    if (!check.ok) return;
    await changeSplit('split', check.parts);
  };

  async function changeSplit(
    action: 'split' | 'split-remove',
    parts: { categoryId: string; amountRappen: number; note: string | null }[],
  ) {
    setSaving(action);
    setError(null);
    try {
      await setSplits.mutateAsync({ id: transaction.id, parts });
      setSplitParts(null);
      setSplitCheck(null);
    } catch (failure) {
      setError(transactionErrorCode(failure));
    } finally {
      setSaving(null);
    }
  }

  const remove = async () => {
    setSheet(null);
    setRestored(false);
    if (await run('delete', { deleted: true })) setJustDeleted(true);
  };

  const restore = async () => {
    if (await run('restore', { deleted: false })) {
      setJustDeleted(false);
      setRestored(true);
    }
  };

  if (deleted) {
    return (
      <>
        <TransactionFacts transaction={transaction} timeZone={timeZone} />
        {error ? (
          <AlertBanner
            tone="danger"
            message={t(`transactionErrors.${error}`)}
            testID="detail-error"
          />
        ) : null}
        {justDeleted ? (
          <UndoBar
            message={t('transactionDetail.deleted')}
            actionLabel={t('transactionDetail.undo')}
            onAction={() => void restore()}
            busy={saving === 'restore'}
            testID="detail-undo"
          />
        ) : (
          <AlertBanner
            tone="warning"
            message={t('transactionDetail.deletedNotice')}
            actionLabel={t('transactionDetail.restore')}
            onAction={() => void restore()}
            testID="detail-deleted"
          />
        )}
        <PrimaryButton
          variant="secondary"
          label={t('transactionDetail.leave')}
          onPress={leave}
          disabled={busy}
          testID="detail-leave"
        />
      </>
    );
  }

  const manual = transaction.source === 'manual';
  const originalDay = localDayOf(transaction.bookedAt, timeZone);
  const today = localDateIn(new Date(), timeZone);
  const amountCheck = parseAmountInput(amountText);
  const manualDirty =
    (amountCheck.ok ? amountCheck.rappen !== totalAbs : amountText.trim() !== '') ||
    day !== originalDay;
  const fixedCost = transaction.fixedCostId
    ? lookups.fixedCosts.get(transaction.fixedCostId)
    : undefined;
  const fixedCostChoices = (fixedCosts.data ?? []).filter(
    (candidate) => candidate.active || candidate.id === transaction.fixedCostId,
  );
  const selectedCategory = transaction.needsReview
    ? null
    : (transaction.categoryId ?? (transaction.categorizedBy === 'user' ? NONE : null));

  const saveManual = async () => {
    if (!amountCheck.ok) return;
    const patch: TransactionPatch = {};
    if (amountCheck.rappen !== totalAbs) patch.amountRappen = sign * amountCheck.rappen;
    if (day !== originalDay) {
      patch.bookedAt = instantAt(day, localTimeOf(transaction.bookedAt, timeZone), timeZone);
    }
    await run('manual', patch);
  };

  return (
    <>
      <TransactionFacts transaction={transaction} timeZone={timeZone} />
      {restored ? (
        <AlertBanner
          tone="info"
          message={t('transactionDetail.restored')}
          testID="detail-restored"
        />
      ) : null}
      {transaction.needsReview && !ruleOffer ? (
        <AlertBanner
          tone="warning"
          message={t('transactionDetail.needsReview')}
          testID="detail-needs-review"
        />
      ) : null}
      {error ? (
        <AlertBanner
          tone="danger"
          message={t(`transactionErrors.${error}`)}
          testID="detail-error"
        />
      ) : null}

      <View style={styles.section}>
        <Card padded={false}>
          <SettingsRow
            label={t('transactionDetail.category')}
            value={
              isSplit
                ? t('transactionDetail.splitValue', { count: transaction.splits.length })
                : placementLabel(transaction, lookups, t) || undefined
            }
            onPress={isSplit || busy ? undefined : () => setSheet('category')}
            testID="detail-category"
          />
          {transaction.amountRappen < 0 || transaction.fixedCostId ? (
            <>
              <Divider inset />
              <SettingsRow
                label={t('transactionDetail.fixedCost')}
                value={
                  fixedCost ? fixedCostName(fixedCost, t) : t('transactionDetail.fixedCostNone')
                }
                onPress={busy ? undefined : () => setSheet('fixed-cost')}
                testID="detail-fixed-cost"
              />
            </>
          ) : null}
        </Card>
        {isSplit ? (
          <AppText variant="caption" tone="secondary">
            {t('transactionDetail.splitIsSplit')}
          </AppText>
        ) : null}
        {fixedCost ? (
          <AppText tone="secondary" testID="detail-fixed-cost-plan">
            {t('transactionDetail.fixedCostInPlan', { name: fixedCostName(fixedCost, t) })}
          </AppText>
        ) : null}
        {saving === 'category' || saving === 'fixed-cost' ? (
          <ActivityIndicator color={theme.colors.accent} testID="detail-saving" />
        ) : null}
      </View>

      {ruleOffer ? (
        <RuleQuestion
          pattern={ruleOffer.rule.pattern}
          categoryName={nameOf(ruleOffer.categoryId)}
          onYes={() => void answerRule(true)}
          onNo={() => void answerRule(false)}
          saving={saving === 'rule-yes' ? 'yes' : saving === 'rule-no' ? 'no' : null}
          testIDPrefix="detail"
        />
      ) : null}
      {ruleDone ? (
        <AlertBanner
          tone="info"
          message={
            ruleDone.count > 0
              ? t('review.rule.recategorized', { count: ruleDone.count })
              : t('review.rule.saved', {
                  pattern: ruleDone.pattern,
                  category: nameOf(ruleDone.categoryId),
                })
          }
          testID="detail-rule-result"
        />
      ) : null}

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('transactionDetail.splitTitle')}
        </AppText>
        {splitParts ? (
          <>
            <SplitFields
              totalAbs={totalAbs}
              parts={splitParts}
              onChange={(parts) => {
                setSplitParts(parts);
                if (splitCheck) setSplitCheck(checkSplit(totalAbs, sign, parts));
              }}
              categories={choices}
              problem={splitCheck && !splitCheck.ok ? splitCheck.problem : undefined}
              partProblems={splitCheck && !splitCheck.ok ? splitCheck.partProblems : undefined}
              testID="detail-split-editor"
            />
            <View style={styles.buttons}>
              <PrimaryButton
                label={t('transactionDetail.splitSave')}
                onPress={() => void saveSplit()}
                loading={saving === 'split'}
                disabled={busy && saving !== 'split'}
                testID="detail-split-save"
              />
              <PrimaryButton
                variant="secondary"
                label={t('transactionDetail.splitCancel')}
                onPress={() => {
                  setSplitParts(null);
                  setSplitCheck(null);
                }}
                disabled={busy}
                testID="detail-split-cancel"
              />
              {isSplit ? (
                <PrimaryButton
                  variant="destructive"
                  label={t('transactionDetail.splitRemove')}
                  onPress={() => void changeSplit('split-remove', [])}
                  loading={saving === 'split-remove'}
                  disabled={busy && saving !== 'split-remove'}
                  testID="detail-split-remove"
                />
              ) : null}
            </View>
          </>
        ) : (
          <Card padded={false}>
            {transaction.splits.map((part, index) => (
              <View key={part.id}>
                {index > 0 ? <Divider inset /> : null}
                <SettingsRow
                  label={
                    part.categoryId
                      ? nameOf(part.categoryId)
                      : t('transactions.labels.uncategorized')
                  }
                  value={formatChf(Math.abs(part.amountRappen), { language })}
                  testID={`detail-split-part-${index}`}
                />
              </View>
            ))}
            {isSplit ? <Divider inset /> : null}
            <SettingsRow
              label={t('transactionDetail.splitStart')}
              onPress={
                busy
                  ? undefined
                  : () => {
                      setRuleOffer(null);
                      setSplitParts(
                        isSplit
                          ? partsFromSplits(transaction.splits)
                          : startSplit(transaction.categoryId),
                      );
                    }
              }
              testID="detail-split"
            />
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <TextField
          label={t('transactionDetail.merchant')}
          value={merchant}
          onChangeText={setMerchant}
          maxLength={MERCHANT_MAX_LENGTH}
          autoCapitalize="words"
          testID="detail-merchant"
        />
        {merchant.trim() !== (transaction.merchant ?? '') ? (
          <PrimaryButton
            variant="secondary"
            label={t('transactionDetail.saveMerchant')}
            onPress={() => void run('merchant', { merchant: merchant.trim() || null })}
            loading={saving === 'merchant'}
            disabled={busy && saving !== 'merchant'}
            testID="detail-merchant-save"
          />
        ) : null}
        <TextField
          label={t('transactionDetail.note')}
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX_LENGTH}
          testID="detail-note"
        />
        {note.trim() !== (transaction.note ?? '') ? (
          <PrimaryButton
            variant="secondary"
            label={t('transactionDetail.saveNote')}
            onPress={() => void run('note', { note: note.trim() || null })}
            loading={saving === 'note'}
            disabled={busy && saving !== 'note'}
            testID="detail-note-save"
          />
        ) : null}
      </View>

      {manual ? (
        <View style={styles.section}>
          <AppText variant="heading" accessibilityRole="header">
            {t('transactionDetail.editTitle')}
          </AppText>
          <AmountInput
            label={t('transactionDetail.amount')}
            currency={BASE_CURRENCY}
            value={amountText}
            onChangeText={setAmountText}
            error={
              amountCheck.ok
                ? undefined
                : amountCheck.problem === 'required'
                  ? t('quickAdd.amountRequired')
                  : t('quickAdd.amountInvalid')
            }
            testID="detail-edit-amount"
          />
          <Stepper
            label={t('transactionDetail.day')}
            valueText={formatWeekdayDate(day, language)}
            onDecrement={() => setDay((current) => addDays(current, -1))}
            onIncrement={() => setDay((current) => addDays(current, 1))}
            decrementLabel={t('transactionDetail.dayBefore')}
            incrementLabel={t('transactionDetail.dayAfter')}
            canIncrement={compareLocalDates(day, today) < 0}
            testID="detail-edit-day"
          />
          {manualDirty ? (
            <PrimaryButton
              variant="secondary"
              label={t('transactionDetail.saveAmountDay')}
              onPress={() => void saveManual()}
              loading={saving === 'manual'}
              disabled={!amountCheck.ok || (busy && saving !== 'manual')}
              testID="detail-edit-save"
            />
          ) : null}
        </View>
      ) : null}

      <PrimaryButton
        variant="destructive"
        label={t('transactionDetail.delete')}
        onPress={() => setSheet('delete')}
        disabled={busy}
        loading={saving === 'delete'}
        testID="detail-delete"
      />

      <BottomSheet
        visible={sheet === 'category'}
        onClose={() => setSheet(null)}
        title={t('transactionDetail.categoryTitle')}
        closeLabel={t('common.close')}
        testID="detail-category-sheet"
      >
        <ScrollView style={styles.sheetScroll}>
          <ChoiceList<string>
            options={[
              ...choices.map((category) => ({
                value: category.id,
                label: categoryName(category, t),
                testID: `detail-category-option-${categoryTestKey(category)}`,
              })),
              {
                value: NONE,
                label: t('transactionDetail.noCategory'),
                testID: 'detail-category-option-none',
              },
            ]}
            selected={selectedCategory}
            onSelect={chooseCategory}
            accessibilityLabel={t('transactionDetail.category')}
          />
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'fixed-cost'}
        onClose={() => setSheet(null)}
        title={t('transactionDetail.fixedCostTitle')}
        closeLabel={t('common.close')}
        testID="detail-fixed-cost-sheet"
      >
        <View style={styles.sheetBody}>
          {fixedCostChoices.length === 0 ? (
            <AppText tone="secondary">{t('transactionDetail.noFixedCosts')}</AppText>
          ) : null}
          <ScrollView style={styles.sheetScroll}>
            <ChoiceList<string>
              options={[
                ...fixedCostChoices.map((candidate) => ({
                  value: candidate.id,
                  label: fixedCostName(candidate, t),
                  description: formatChf(candidate.amountRappen, { language }),
                  testID: `detail-fixed-cost-option-${candidate.id}`,
                })),
                {
                  value: NONE,
                  label: t('transactionDetail.fixedCostNoneOption'),
                  testID: 'detail-fixed-cost-option-none',
                },
              ]}
              selected={transaction.fixedCostId ?? NONE}
              onSelect={(value) => {
                setSheet(null);
                setRuleOffer(null);
                void run('fixed-cost', { fixedCostId: value === NONE ? null : value });
              }}
              accessibilityLabel={t('transactionDetail.fixedCost')}
            />
          </ScrollView>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'delete'}
        onClose={() => setSheet(null)}
        title={t('transactionDetail.deleteTitle')}
        closeLabel={t('common.close')}
        testID="detail-delete-sheet"
      >
        <View style={styles.sheetBody}>
          <AppText>{t('transactionDetail.deleteMessage')}</AppText>
          <PrimaryButton
            variant="destructive"
            label={t('transactionDetail.deleteConfirm')}
            onPress={() => void remove()}
            testID="detail-delete-confirm"
          />
          <PrimaryButton
            variant="secondary"
            label={t('transactionDetail.deleteCancel')}
            onPress={() => setSheet(null)}
            testID="detail-delete-cancel"
          />
        </View>
      </BottomSheet>
    </>
  );
}
