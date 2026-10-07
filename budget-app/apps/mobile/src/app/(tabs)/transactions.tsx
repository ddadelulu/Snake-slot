import { addDays, localDateIn, type LocalDate } from '@budget/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, SectionList, View } from 'react-native';

import {
  AlertBanner,
  AppText,
  BottomSheet,
  ChipGroup,
  ChoiceList,
  Divider,
  EmptyState,
  FilterChip,
  LinkBanner,
  PrimaryButton,
  Screen,
  SearchField,
  ToggleChip,
  TransactionRow,
} from '@/components';
import { useCategories } from '@/data/categories';
import { useOverview } from '@/data/overview';
import { useProfile } from '@/data/profile';
import { useTransactions, type TransactionFilter } from '@/data/transactions';
import { categoryName } from '@/features/categories/categoryName';
import {
  DEFAULT_LIST_FILTER,
  PERIOD_CHOICES,
  SOURCE_CHOICES,
  activeFilterCount,
  toTransactionFilter,
  toggleCategory,
  waitsForPeriod,
  type ListFilterState,
  type PeriodChoice,
  type SourceChoice,
} from '@/features/transactions/filters';
import { formatWeekdayDate } from '@/features/transactions/format';
import { groupByDay } from '@/features/transactions/grouping';
import { categoryTestKey, placementLabel } from '@/features/transactions/labels';
import { useDebouncedValue } from '@/features/transactions/useDebouncedValue';
import { useLookups } from '@/features/transactions/useLookups';
import { useLanguage } from '@/i18n';
import { formatShortDate } from '@/i18n/format';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  header: { gap: theme.spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  list: { flex: 1, marginHorizontal: -theme.layout.screenPadding },
  listContent: { paddingBottom: theme.spacing.xl },
  dayHeader: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxxl,
  },
  footer: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingVertical: theme.spacing.lg,
  },
  sheetBody: { gap: theme.spacing.lg },
  sheetScroll: { flexGrow: 0 },
}));

type Sheet = 'category' | 'source' | 'period';

/** US-3.4: every transaction, newest first, with search and filters for category, source and month. */
export default function TransactionsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { data: profile } = useProfile();
  const overview = useOverview();
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [filters, setFilters] = useState<ListFilterState>(DEFAULT_LIST_FILTER);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const period = overview.data
    ? { startsOn: overview.data.data.period.startsOn, endsOn: overview.data.data.period.endsOn }
    : null;
  const payday = profile?.payday ?? null;
  const filter = toTransactionFilter(filters, debouncedSearch, period, payday);
  const narrowed = debouncedSearch.trim() !== '' || activeFilterCount(filters) > 0;
  const needsReview = overview.data?.data.needsReviewCount ?? 0;
  const allCategories = categories.data ?? [];
  const byId = new Map(allCategories.map((category) => [category.id, category]));

  const selectedCount = filters.categoryIds.length + (filters.uncategorized ? 1 : 0);
  const onlyCategory =
    filters.categoryIds.length === 1 ? byId.get(filters.categoryIds[0] ?? '') : undefined;
  const categoryValue =
    selectedCount === 0
      ? t('transactions.filters.categoryAll')
      : selectedCount === 1 && filters.uncategorized
        ? t('transactions.filters.uncategorized')
        : selectedCount === 1 && onlyCategory
          ? categoryName(onlyCategory, t)
          : t('transactions.filters.categoryCount', { count: selectedCount });
  const sourceLabel = (source: SourceChoice) =>
    source === 'all' ? t('transactions.filters.sourceAll') : t(`transactions.sources.${source}`);

  const showEverything = () => {
    setSearch('');
    setFilters(DEFAULT_LIST_FILTER);
  };

  return (
    <Screen
      title={t('tabs.transactions')}
      edges={['top', 'left', 'right']}
      testID="transactions-screen"
    >
      <View style={styles.header}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          label={t('transactions.searchLabel')}
          placeholder={t('transactions.searchPlaceholder')}
          clearLabel={t('transactions.clearSearch')}
          testID="transactions-search"
        />
        <View style={styles.filters} accessibilityLabel={t('transactions.filters.label')}>
          <FilterChip
            label={t('transactions.filters.category')}
            value={categoryValue}
            active={selectedCount > 0}
            onPress={() => setSheet('category')}
            accessibilityHint={t('transactions.filters.openHint')}
            testID="transactions-filter-category"
          />
          <FilterChip
            label={t('transactions.filters.source')}
            value={sourceLabel(filters.source)}
            active={filters.source !== 'all'}
            onPress={() => setSheet('source')}
            accessibilityHint={t('transactions.filters.openHint')}
            testID="transactions-filter-source"
          />
          <FilterChip
            label={t('transactions.filters.period')}
            value={t(`transactions.filters.periods.${filters.period}`)}
            active={filters.period !== 'all'}
            onPress={() => setSheet('period')}
            accessibilityHint={t('transactions.filters.openHint')}
            testID="transactions-filter-period"
          />
        </View>
        {needsReview > 0 ? (
          <LinkBanner
            tone="warning"
            message={t('transactions.toReview', { count: needsReview })}
            accessibilityHint={t('transactions.toReviewHint')}
            onPress={() => router.push('/review')}
            testID="transactions-review"
          />
        ) : null}
      </View>

      {waitsForPeriod(filters, period) ? (
        overview.isError ? (
          <EmptyState
            title={t('transactions.loadError')}
            message={t('transactions.loadErrorMessage')}
            actionLabel={t('transactions.retry')}
            onAction={() => void overview.refetch()}
            testID="transactions-error"
          />
        ) : (
          <Loading />
        )
      ) : (
        <TransactionList
          filter={filter}
          narrowed={narrowed}
          onShowEverything={showEverything}
          timezone={profile?.timezone ?? 'Europe/Zurich'}
        />
      )}

      <BottomSheet
        visible={sheet === 'category'}
        onClose={() => setSheet(null)}
        title={t('transactions.filters.categoryTitle')}
        closeLabel={t('common.close')}
        testID="transactions-category-sheet"
      >
        <View style={styles.sheetBody}>
          <ScrollView style={styles.sheetScroll}>
            <ChipGroup accessibilityLabel={t('transactions.filters.category')}>
              {allCategories.map((category) => (
                <ToggleChip
                  key={category.id}
                  label={categoryName(category, t)}
                  selected={filters.categoryIds.includes(category.id)}
                  onToggle={() => setFilters((current) => toggleCategory(current, category.id))}
                  testID={`transactions-category-${categoryTestKey(category)}`}
                />
              ))}
              <ToggleChip
                label={t('transactions.filters.uncategorized')}
                selected={filters.uncategorized}
                onToggle={() =>
                  setFilters((current) => ({ ...current, uncategorized: !current.uncategorized }))
                }
                testID="transactions-category-none"
              />
            </ChipGroup>
          </ScrollView>
          <PrimaryButton
            label={t('transactions.filters.done')}
            onPress={() => setSheet(null)}
            testID="transactions-category-done"
          />
          {selectedCount > 0 ? (
            <PrimaryButton
              variant="secondary"
              label={t('transactions.filters.showAll')}
              onPress={() =>
                setFilters((current) => ({ ...current, categoryIds: [], uncategorized: false }))
              }
              testID="transactions-category-clear"
            />
          ) : null}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'source'}
        onClose={() => setSheet(null)}
        title={t('transactions.filters.sourceTitle')}
        closeLabel={t('common.close')}
        testID="transactions-source-sheet"
      >
        <ChoiceList<SourceChoice>
          options={SOURCE_CHOICES.map((value) => ({ value, label: sourceLabel(value) }))}
          selected={filters.source}
          onSelect={(source) => {
            setFilters((current) => ({ ...current, source }));
            setSheet(null);
          }}
          accessibilityLabel={t('transactions.filters.source')}
          testID="transactions-source"
        />
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'period'}
        onClose={() => setSheet(null)}
        title={t('transactions.filters.periodTitle')}
        closeLabel={t('common.close')}
        testID="transactions-period-sheet"
      >
        <ChoiceList<PeriodChoice>
          options={PERIOD_CHOICES.map((value) => ({
            value,
            label: t(`transactions.filters.periods.${value}`),
          }))}
          selected={filters.period}
          onSelect={(value) => {
            setFilters((current) => ({ ...current, period: value }));
            setSheet(null);
          }}
          accessibilityLabel={t('transactions.filters.period')}
          testID="transactions-period"
        />
      </BottomSheet>
    </Screen>
  );
}

function Loading() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.centered} testID="transactions-loading">
      <ActivityIndicator
        color={theme.colors.accent}
        accessibilityLabel={t('transactions.loading')}
      />
    </View>
  );
}

function TransactionList({
  filter,
  narrowed,
  onShowEverything,
  timezone,
}: {
  filter: TransactionFilter;
  narrowed: boolean;
  onShowEverything: () => void;
  timezone: string;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { language } = useLanguage();
  const lookups = useLookups();
  const query = useTransactions(filter);
  const pages = query.data?.pages;
  const sections = useMemo(
    () => groupByDay(pages?.flatMap((page) => page.items) ?? [], timezone),
    [pages, timezone],
  );

  // A failed next page keeps the pages already shown (its retry sits at the end of the list).
  if (query.data === undefined) {
    if (!query.isError) return <Loading />;
    return (
      <EmptyState
        title={t('transactions.loadError')}
        message={t('transactions.loadErrorMessage')}
        actionLabel={t('transactions.retry')}
        onAction={() => void query.refetch()}
        testID="transactions-error"
      />
    );
  }
  if (sections.length === 0) {
    return narrowed ? (
      <EmptyState
        title={t('transactions.noMatchesTitle')}
        message={t('transactions.noMatchesMessage')}
        actionLabel={t('transactions.showEverything')}
        onAction={onShowEverything}
        testID="transactions-no-matches"
      />
    ) : (
      <EmptyState
        title={t('transactions.emptyTitle')}
        message={t('transactions.emptyMessage')}
        testID="transactions-empty"
      />
    );
  }

  const today = localDateIn(new Date(), timezone);
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void query.fetchNextPage();
    }
  };

  return (
    <SectionList
      testID="transactions-list"
      style={styles.list}
      contentContainerStyle={styles.listContent}
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      onRefresh={() => void query.refetch()}
      renderSectionHeader={({ section }) => (
        <View style={styles.dayHeader}>
          <AppText
            variant="label"
            tone="secondary"
            accessibilityRole="header"
            testID={`transactions-day-${section.day}`}
          >
            {dayHeading(section.day, today, language, t)}
          </AppText>
        </View>
      )}
      ItemSeparatorComponent={Separator}
      renderItem={({ item }) => {
        const placement = placementLabel(item, lookups, t);
        const day = formatShortDate(item.bookedAt, language, timezone);
        return (
          <TransactionRow
            merchant={item.merchant ?? item.note ?? item.rawText ?? placement}
            amount={item.amountRappen}
            language={language}
            subtitle={placement ? `${placement} · ${day}` : day}
            onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })}
            accessibilityHint={t('transactions.openHint')}
            testID={`transactions-row-${item.id}`}
          />
        );
      }}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View style={styles.footer} testID="transactions-loading-more">
            <ActivityIndicator
              color={theme.colors.accent}
              accessibilityLabel={t('transactions.loading')}
            />
          </View>
        ) : query.isFetchNextPageError ? (
          <View style={styles.footer}>
            <AlertBanner
              tone="danger"
              message={t('transactions.loadMoreError')}
              actionLabel={t('transactions.retry')}
              onAction={() => void query.fetchNextPage()}
              testID="transactions-more-error"
            />
          </View>
        ) : null
      }
    />
  );
}

function Separator() {
  return <Divider inset />;
}

function dayHeading(
  day: LocalDate,
  today: LocalDate,
  language: ReturnType<typeof useLanguage>['language'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (day === today) return t('transactions.today');
  if (day === addDays(today, -1)) return t('transactions.yesterday');
  return formatWeekdayDate(day, language, { year: day.slice(0, 4) !== today.slice(0, 4) });
}
