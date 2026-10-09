import { forecastPace, formatChf, parseChf, parseLocalDate, type LocalDate } from '@budget/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import {
  AlertBanner,
  AmountInput,
  AppText,
  BottomSheet,
  Card,
  Divider,
  EmptyState,
  PrimaryButton,
  ProgressBar,
  Screen,
  ScreenHeader,
  TextLink,
  TransactionRow,
} from '@/components';
import { useCategoryDetail, useSetBudget, type CategoryDetail } from '@/data/categoryDetail';
import { useProfile } from '@/data/profile';
import { useTransactions } from '@/data/transactions';
import { categoryName } from '@/features/categories/categoryName';
import { rappenToInput } from '@/features/transactions/amount';
import { useLanguage } from '@/i18n';
import { LOCALE, formatDayMonth, formatShortDate } from '@/i18n/format';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.sm },
  loading: { paddingVertical: theme.spacing.xxxl, alignItems: 'center' },
  figures: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md },
  figure: { flex: 1, gap: theme.spacing.xxs },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: theme.sizes.historyBarMaxHeight + theme.spacing.xl,
  },
  column: { alignItems: 'center', gap: theme.spacing.xs, flex: 1 },
  barArea: {
    height: theme.sizes.historyBarMaxHeight,
    width: theme.sizes.historyBarWidth,
    justifyContent: 'flex-end',
  },
  bar: { width: '100%', borderTopLeftRadius: theme.radii.sm, borderTopRightRadius: theme.radii.sm },
  budgetMark: {
    position: 'absolute',
    left: -theme.spacing.xs,
    right: -theme.spacing.xs,
    height: theme.borderWidths.thick,
    backgroundColor: theme.colors.borderStrong,
  },
  sheet: { gap: theme.spacing.md },
}));

function shortMonth(date: LocalDate, language: 'de' | 'en'): string {
  const { year, month } = parseLocalDate(date);
  return new Intl.DateTimeFormat(LOCALE[language], { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/**
 * One category (M4-07): this month's budget, spending, what is left and what rolled over, the pace
 * forecast, the last six months as bars, its purchases, and "Change budget" (`set_budget`).
 */
export default function CategoryDetailScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useCategoryDetail(id);

  const header = <ScreenHeader backLabel={t('categoryDetail.back')} onBack={() => goBackOr('/')} />;

  if (detail.isPending) {
    return (
      <Screen testID="category-screen">
        {header}
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (detail.isError) {
    return (
      <Screen testID="category-screen">
        {header}
        <EmptyState
          title={t('categoryDetail.loadError')}
          message={t('transactions.loadErrorMessage')}
          actionLabel={t('transactions.retry')}
          onAction={() => void detail.refetch()}
          testID="category-load-error"
        />
      </Screen>
    );
  }

  if (!detail.data) {
    return (
      <Screen testID="category-screen">
        {header}
        <EmptyState
          title={t('categoryDetail.notFoundTitle')}
          message={t('categoryDetail.notFoundMessage')}
          testID="category-not-found"
        />
      </Screen>
    );
  }

  const name = categoryName(detail.data.category, t);

  return (
    <Screen scroll testID="category-screen">
      {header}
      <AppText variant="title" accessibilityRole="header" testID="category-name">
        {name}
      </AppText>
      <Month detail={detail.data} name={name} />
      <History detail={detail.data} />
      <Purchases categoryId={detail.data.category.id} />
    </Screen>
  );
}

function Month({ detail, name }: { detail: CategoryDetail; name: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { language } = useLanguage();
  const setBudget = useSetBudget();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);

  const available = Math.max(0, detail.budgetRappen + detail.rolloverRappen);
  const left = available - detail.spentRappen;
  const pace = forecastPace({
    budgetRappen: available,
    spentRappen: detail.spentRappen,
    period: detail.period,
    today: detail.today,
  });
  const paceText =
    pace.kind === 'runs_out'
      ? t('categoryDetail.pace.runs_out', { date: formatDayMonth(pace.on, language) })
      : t(`categoryDetail.pace.${pace.kind}`);

  const open = () => {
    setText(rappenToInput(detail.budgetRappen));
    setInvalid(false);
    setFailed(false);
    setEditing(true);
  };

  const save = async () => {
    const amount = parseChf(text.trim());
    if (text.trim() === '' || amount === null || amount < 0) {
      setInvalid(true);
      return;
    }
    setFailed(false);
    try {
      await setBudget.mutateAsync({ categoryId: detail.category.id, amountRappen: amount });
      setEditing(false);
    } catch {
      setFailed(true);
    }
  };

  const figure = (label: string, amount: number, testID: string, tone?: 'danger') => (
    <View style={styles.figure}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="bodyStrong" tone={tone} numeric testID={testID}>
        {formatChf(amount, { language })}
      </AppText>
    </View>
  );

  return (
    <View style={styles.section}>
      <Card>
        <View style={styles.section}>
          <View style={styles.figures}>
            {figure(t('categoryDetail.budget'), detail.budgetRappen, 'category-budget')}
            {figure(t('categoryDetail.spent'), detail.spentRappen, 'category-spent')}
            {left >= 0
              ? figure(t('categoryDetail.left'), left, 'category-left')
              : figure(t('categoryDetail.over'), -left, 'category-left', 'danger')}
          </View>
          <ProgressBar
            spent={detail.spentRappen}
            budget={available}
            accessibilityLabel={name}
            testID="category-progress"
          />
          {detail.rolloverRappen !== 0 ? (
            <AppText tone="secondary" testID="category-rollover">
              {t('categoryDetail.rollover', {
                amount: formatChf(detail.rolloverRappen, { language }),
              })}
            </AppText>
          ) : null}
          <AppText
            tone={pace.kind === 'runs_out' || pace.kind === 'exhausted' ? 'warning' : 'secondary'}
            testID="category-pace"
          >
            {paceText}
          </AppText>
        </View>
      </Card>
      <PrimaryButton
        variant="secondary"
        label={t('categoryDetail.editBudget')}
        onPress={open}
        testID="category-edit-budget"
      />
      <BottomSheet
        visible={editing}
        onClose={() => setEditing(false)}
        title={t('categoryDetail.budgetSheetTitle', { name })}
        closeLabel={t('common.close')}
        testID="category-budget-sheet"
      >
        <View style={styles.sheet}>
          {failed ? (
            <AlertBanner
              tone="danger"
              message={t('categoryDetail.saveError')}
              testID="category-budget-error"
            />
          ) : null}
          <AmountInput
            label={t('categoryDetail.budgetAmount')}
            currency="CHF"
            value={text}
            onChangeText={(value) => {
              setText(value);
              setInvalid(false);
            }}
            hint={t('categoryDetail.budgetHint')}
            error={invalid ? t('categoryDetail.budgetInvalid') : undefined}
            testID="category-budget-input"
          />
          <PrimaryButton
            label={t('categoryDetail.save')}
            onPress={() => void save()}
            loading={setBudget.isPending}
            testID="category-budget-save"
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function History({ detail }: { detail: CategoryDetail }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { language } = useLanguage();
  const months = detail.history.slice(-6);
  const top = Math.max(1, ...months.flatMap((month) => [month.budgetRappen, month.spentRappen]));
  const height = (amount: number) =>
    Math.round((Math.max(0, amount) / top) * theme.sizes.historyBarMaxHeight);

  return (
    <View style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {t('categoryDetail.historyTitle')}
      </AppText>
      {months.length === 0 ? (
        <AppText tone="secondary">{t('categoryDetail.historyEmpty')}</AppText>
      ) : (
        <Card>
          <View style={styles.chart}>
            {months.map((month, index) => {
              const over = month.spentRappen > month.budgetRappen;
              const label = shortMonth(month.startsOn, language);
              return (
                <View
                  key={month.startsOn}
                  style={styles.column}
                  accessible
                  accessibilityLabel={t('categoryDetail.historyBar', {
                    month: label,
                    spent: formatChf(month.spentRappen, { language }),
                    budget: formatChf(month.budgetRappen, { language }),
                  })}
                  testID={`category-history-${index}`}
                >
                  <View style={styles.barArea}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: height(month.spentRappen),
                          backgroundColor: over ? theme.colors.statusDanger : theme.colors.accent,
                        },
                      ]}
                    />
                    <View style={[styles.budgetMark, { bottom: height(month.budgetRappen) }]} />
                  </View>
                  <AppText variant="caption" tone="secondary">
                    {label}
                  </AppText>
                </View>
              );
            })}
          </View>
        </Card>
      )}
    </View>
  );
}

function Purchases({ categoryId }: { categoryId: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { language } = useLanguage();
  const { data: profile } = useProfile();
  const timezone = profile?.timezone ?? 'Europe/Zurich';
  const transactions = useTransactions({ categoryIds: [categoryId] });
  const items = transactions.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {t('categoryDetail.transactionsTitle')}
      </AppText>
      {transactions.isError ? (
        <AlertBanner
          tone="danger"
          message={t('transactions.loadError')}
          actionLabel={t('transactions.retry')}
          onAction={() => void transactions.refetch()}
          testID="category-transactions-error"
        />
      ) : items.length === 0 ? (
        transactions.isPending ? null : (
          <AppText tone="secondary" testID="category-no-transactions">
            {t('categoryDetail.noTransactions')}
          </AppText>
        )
      ) : (
        <Card padded={false}>
          {items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider inset /> : null}
              <TransactionRow
                merchant={item.merchant ?? item.note ?? item.rawText ?? t('moment.unknownMerchant')}
                amount={item.amountRappen}
                language={language}
                subtitle={formatShortDate(item.bookedAt, language, timezone)}
                onPress={() =>
                  router.push({ pathname: '/transaction/[id]', params: { id: item.id } })
                }
                accessibilityHint={t('transactions.openHint')}
                testID={`category-transaction-${index}`}
              />
            </View>
          ))}
        </Card>
      )}
      {transactions.hasNextPage ? (
        <TextLink
          label={t('categoryDetail.loadMore')}
          onPress={() => void transactions.fetchNextPage()}
          testID="category-load-more"
        />
      ) : null}
    </View>
  );
}
