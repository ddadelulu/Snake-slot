import { addDays, type LocalDate } from '@budget/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import {
  AlertBanner,
  AppText,
  Card,
  ChoiceChips,
  EmptyState,
  Screen,
  ScreenHeader,
  StepProgress,
  TextLink,
  transactionAmountText,
} from '@/components';
import { useCategories } from '@/data/categories';
import { useOverview } from '@/data/overview';
import { useProfile } from '@/data/profile';
import {
  useTransactions,
  useUpdateTransaction,
  type RulePatch,
  type TransactionItem,
  type TransactionPatch,
} from '@/data/transactions';
import { categoryName } from '@/features/categories/categoryName';
import { transactionErrorCode, type TransactionErrorCode } from '@/features/transactions/errors';
import { formatWeekdayDate, localDayOf } from '@/features/transactions/format';
import { activeCategories, categoryTestKey } from '@/features/transactions/labels';
import { mergeQueue, nextOpenPosition } from '@/features/transactions/reviewQueue';
import { RuleQuestion } from '@/features/transactions/RuleQuestion';
import { rulePromptFor } from '@/features/transactions/rulePrompt';
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
  card: { gap: theme.spacing.lg },
  question: { gap: theme.spacing.xs },
  skip: { alignSelf: 'flex-start' },
}));

const close = () => goBackOr('/');

/**
 * US-3.3: the purchases of this month the app is not sure about, one at a time: "CHF 84.00 at
 * Manor: what was it?", the categories as buttons, then "Always do this for Manor?".
 */
export default function ReviewScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const overview = useOverview();
  const period = overview.data?.data.period;

  return (
    <Screen scroll testID="review-screen">
      <ScreenHeader backLabel={t('review.back')} onBack={close} testID="review-header" />
      <AppText variant="title" accessibilityRole="header">
        {t('review.title')}
      </AppText>
      {period ? (
        <Queue from={period.startsOn} to={addDays(period.endsOn, -1)} />
      ) : overview.isPending ? (
        <View style={styles.loading} testID="review-loading">
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : overview.isError ? (
        <EmptyState
          title={t('review.loadError')}
          message={t('transactions.loadErrorMessage')}
          actionLabel={t('transactions.retry')}
          onAction={() => void overview.refetch()}
          testID="review-error"
        />
      ) : (
        <Finished skipped={0} empty />
      )}
    </Screen>
  );
}

type Saving = 'category' | 'rule-yes' | 'rule-no';

function Queue({ from, to }: { from: LocalDate; to: LocalDate }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { language } = useLanguage();
  const { data: profile } = useProfile();
  const categories = useCategories();
  const query = useTransactions({ needsReview: true, from, to });
  const update = useUpdateTransaction();
  const timeZone = profile?.timezone ?? 'Europe/Zurich';

  // The questions are fixed when the list first loads, so answering one does not reshuffle the
  // rest; pages loaded later are added at the end.
  const [queue, setQueue] = useState<TransactionItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [offer, setOffer] = useState<{ categoryId: string; rule: RulePatch } | null>(null);
  const [saving, setSaving] = useState<Saving | null>(null);
  const [error, setError] = useState<TransactionErrorCode | null>(null);
  const [ruleDone, setRuleDone] = useState<{ count: number; pattern: string; name: string } | null>(
    null,
  );

  const loaded = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? null,
    [query.data],
  );
  const [merged, setMerged] = useState<TransactionItem[] | null>(null);
  if (loaded !== null && loaded !== merged) {
    setMerged(loaded);
    setQueue((current) => mergeQueue(current, loaded));
  }

  // A rule answered earlier may already have placed later questions: those are passed over.
  const open = new Set((loaded ?? []).map((item) => item.id));
  const position = queue ? nextOpenPosition(queue, index, open) : 0;
  const current = queue?.[position];
  const atEnd = queue !== null && position >= queue.length;
  const needsMore = atEnd && query.hasNextPage;

  useEffect(() => {
    if (needsMore && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void query.fetchNextPage();
    }
  }, [needsMore, query]);

  if (query.isError && queue === null) {
    return (
      <EmptyState
        title={t('review.loadError')}
        message={t('transactions.loadErrorMessage')}
        actionLabel={t('transactions.retry')}
        onAction={() => void query.refetch()}
        testID="review-error"
      />
    );
  }
  if (queue === null || (needsMore && !query.isFetchNextPageError)) {
    return (
      <View style={styles.loading} testID="review-loading">
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (current === undefined) {
    return <Finished skipped={skipped} empty={queue.length === 0} />;
  }

  const choices = activeCategories(categories.data ?? []);
  const nameOf = (categoryId: string) => {
    const category = choices.find((candidate) => candidate.id === categoryId);
    return category ? categoryName(category, t) : '';
  };
  const next = () => {
    setOffer(null);
    setError(null);
    setIndex(position + 1);
  };

  const save = async (action: Saving, patch: TransactionPatch) => {
    setSaving(action);
    setError(null);
    try {
      return await update.mutateAsync({ id: current.id, patch });
    } catch (failure) {
      setError(transactionErrorCode(failure));
      return null;
    } finally {
      setSaving(null);
    }
  };

  const choose = async (categoryId: string) => {
    setRuleDone(null);
    const rule = rulePromptFor(categoryId, current);
    if (rule !== null) {
      setOffer({ categoryId, rule });
      return;
    }
    if (await save('category', { categoryId })) next();
  };

  const answer = async (always: boolean) => {
    if (!offer) return;
    const { categoryId, rule } = offer;
    const result = await save(
      always ? 'rule-yes' : 'rule-no',
      always ? { categoryId, rule } : { categoryId },
    );
    if (!result) return;
    if (always) {
      setRuleDone({
        count: result.recategorizedCount,
        pattern: rule.pattern,
        name: nameOf(categoryId),
      });
    }
    next();
  };

  const amount = transactionAmountText(current.amountRappen, language);
  const day = localDayOf(current.bookedAt, timeZone);
  const question = current.merchant
    ? t('review.questionAt', { amount, merchant: current.merchant })
    : t('review.question', { amount, date: formatWeekdayDate(day, language) });
  const progress = t('review.progress', { current: position + 1, total: queue.length });

  return (
    <>
      <StepProgress
        current={position + 1}
        total={queue.length}
        label={progress}
        testID="review-progress"
      />
      {ruleDone ? (
        <AlertBanner
          tone="info"
          message={
            ruleDone.count > 0
              ? t('review.rule.recategorized', { count: ruleDone.count })
              : t('review.rule.saved', { pattern: ruleDone.pattern, category: ruleDone.name })
          }
          testID="review-rule-result"
        />
      ) : null}
      <Card testID="review-card">
        <View style={styles.card}>
          <View style={styles.question}>
            <AppText variant="heading" accessibilityRole="header" testID="review-question">
              {question}
            </AppText>
            {current.merchant ? (
              <AppText tone="secondary">{formatWeekdayDate(day, language)}</AppText>
            ) : null}
            {current.rawText ? (
              <AppText variant="caption" tone="secondary" numberOfLines={2}>
                {current.rawText}
              </AppText>
            ) : null}
          </View>
          <ChoiceChips
            options={choices.map((category) => ({
              value: category.id,
              label: categoryName(category, t),
              testID: `review-category-${categoryTestKey(category)}`,
            }))}
            selected={offer?.categoryId ?? null}
            onSelect={(categoryId) => void choose(categoryId)}
            accessibilityLabel={t('review.categories')}
            disabled={saving !== null}
            size="large"
            testID="review-categories"
          />
        </View>
      </Card>
      {error ? (
        <AlertBanner
          tone="danger"
          message={t(`transactionErrors.${error}`)}
          testID="review-save-error"
        />
      ) : null}
      {offer ? (
        <RuleQuestion
          pattern={offer.rule.pattern}
          categoryName={nameOf(offer.categoryId)}
          onYes={() => void answer(true)}
          onNo={() => void answer(false)}
          saving={saving === 'rule-yes' ? 'yes' : saving === 'rule-no' ? 'no' : null}
          testIDPrefix="review"
        />
      ) : null}
      {saving === 'category' ? <ActivityIndicator color={theme.colors.accent} /> : null}
      <View style={styles.skip}>
        <TextLink
          label={t('review.skip')}
          onPress={() => {
            if (saving !== null) return;
            setSkipped((count) => count + 1);
            setRuleDone(null);
            next();
          }}
          testID="review-skip"
        />
      </View>
    </>
  );
}

function Finished({ skipped, empty }: { skipped: number; empty: boolean }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={empty ? t('review.emptyTitle') : t('review.doneTitle')}
      message={
        empty
          ? t('review.emptyMessage')
          : skipped > 0
            ? t('review.skippedMessage', { count: skipped })
            : t('review.doneMessage')
      }
      actionLabel={t('review.close')}
      onAction={close}
      testID="review-done"
    />
  );
}
