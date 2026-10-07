import { formatChf } from '@budget/core';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import {
  AppText,
  BalanceHeader,
  Card,
  CategoryCard,
  Divider,
  EmptyState,
  FloatingActionButton,
  LinkBanner,
  Screen,
  TransactionRow,
} from '@/components';
import { useProfile } from '@/data/profile';
import { useOverview, type HomeModel, type OverviewCategory } from '@/data/overview';
import { NoticeBanner } from '@/features/auth/NoticeBanner';
import { useLanguage } from '@/i18n';
import { formatDayMonth, formatShortDate } from '@/i18n/format';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  root: { flex: 1 },
  section: { gap: theme.spacing.md },
  // Keeps the last row of the list clear of the floating "+" button.
  fabSpace: { height: theme.sizes.fab },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxxl,
  },
  facts: { gap: theme.spacing.xs },
}));

/** Spec section 5: balance, daily allowance, days until payday, categories, latest purchases. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const overview = useOverview();

  return (
    <View style={styles.root}>
      <Screen scroll edges={['top', 'left', 'right']} testID="home-screen">
        <NoticeBanner />
        {overview.isPending ? (
          <View style={styles.loading} testID="home-loading">
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : overview.isError ? (
          <EmptyState
            title={t('home.loadError')}
            message={t('home.emptyMessage')}
            actionLabel={t('home.retry')}
            onAction={() => void overview.refetch()}
            testID="home-error"
          />
        ) : overview.data ? (
          <Month model={overview.data} />
        ) : (
          <EmptyState title={t('home.emptyTitle')} message={t('home.emptyMessage')} />
        )}
        <View style={styles.fabSpace} />
      </Screen>
      <FloatingActionButton
        accessibilityLabel={t('quickAdd.open')}
        accessibilityHint={t('quickAdd.openHint')}
        onPress={() => router.push('/add')}
        testID="home-add"
      />
    </View>
  );
}

function categoryName(
  category: Pick<OverviewCategory, 'defaultKey' | 'name'>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return category.defaultKey ? t(`categories.${category.defaultKey}`) : (category.name ?? '');
}

function Month({ model }: { model: HomeModel }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { language } = useLanguage();
  const { data: profile } = useProfile();
  const { data, overview } = model;
  const timezone = profile?.timezone ?? 'Europe/Zurich';
  const byId = new Map(data.categories.map((category) => [category.categoryId, category]));
  const carried = data.period.carriedOverRappen;

  const paceText =
    overview.pace.kind === 'on_track'
      ? t('home.pace.on_track')
      : overview.pace.kind === 'runs_out'
        ? t('home.pace.runs_out', { date: formatDayMonth(overview.pace.on, language) })
        : overview.pace.kind === 'exhausted'
          ? t('home.pace.exhausted')
          : null;

  return (
    <>
      <BalanceHeader
        remaining={overview.balanceRappen}
        language={language}
        label={t('home.balanceLabel')}
        dailyAllowance={overview.dailyAllowanceRappen}
        dailyAllowanceLabel={t('home.perDay')}
        daysUntilPayday={overview.daysUntilPayday}
        daysUntilPaydayLabel={t('home.daysUntilPayday', { count: overview.daysUntilPayday })}
        testID="home-balance"
      />
      {data.needsReviewCount > 0 ? (
        <LinkBanner
          tone="warning"
          message={t('review.homeBanner', { count: data.needsReviewCount })}
          accessibilityHint={t('review.homeBannerHint')}
          onPress={() => router.push('/review')}
          testID="home-review"
        />
      ) : null}
      {paceText || carried !== 0 ? (
        <View style={styles.facts}>
          {paceText ? (
            <AppText
              tone={overview.pace.kind === 'on_track' ? 'secondary' : 'warning'}
              testID="home-pace"
            >
              {paceText}
            </AppText>
          ) : null}
          {carried !== 0 ? (
            <AppText tone="secondary" testID="home-carried">
              {carried > 0
                ? t('home.carriedOver', { amount: formatChf(carried, { language }) })
                : t('home.carriedDeficit', { amount: formatChf(-carried, { language }) })}
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('home.categoriesTitle')}
        </AppText>
        {overview.categories.map((category) => {
          const info = byId.get(category.categoryId);
          return (
            <CategoryCard
              key={category.categoryId}
              name={info ? categoryName(info, t) : ''}
              spent={category.spentRappen}
              budget={category.budgetRappen}
              language={language}
              remainingLabel={t('home.left')}
              overLabel={t('home.over')}
              testID={`home-category-${info?.defaultKey ?? info?.name ?? category.categoryId}`}
            />
          );
        })}
        {data.uncategorizedSpentRappen !== 0 ? (
          <AppText tone="secondary" testID="home-uncategorized">
            {`${t('home.uncategorized')}: ${formatChf(data.uncategorizedSpentRappen, { language })}`}
          </AppText>
        ) : null}
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('home.recentTitle')}
        </AppText>
        {data.recentTransactions.length === 0 ? (
          <AppText tone="secondary" testID="home-no-transactions">
            {t('home.noTransactions')}
          </AppText>
        ) : (
          <Card padded={false}>
            {data.recentTransactions.map((transaction, index) => {
              const category = transaction.categoryId
                ? byId.get(transaction.categoryId)
                : undefined;
              const label = transaction.isSplit
                ? t('home.split')
                : category
                  ? categoryName(category, t)
                  : t('home.uncategorized');
              return (
                <View key={transaction.id}>
                  {index > 0 ? <Divider inset /> : null}
                  <TransactionRow
                    merchant={transaction.merchant ?? transaction.note ?? label}
                    amount={transaction.amountRappen}
                    language={language}
                    subtitle={`${label} · ${formatShortDate(transaction.bookedAt, language, timezone)}`}
                    onPress={() =>
                      router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } })
                    }
                    accessibilityHint={t('transactions.openHint')}
                    testID={`home-transaction-${index}`}
                  />
                </View>
              );
            })}
          </Card>
        )}
      </View>
    </>
  );
}
