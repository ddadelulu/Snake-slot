import type { Language, ParsedStatement } from '@budget/core';
import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { AlertBanner } from '@/components/AlertBanner';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { CheckRow, type CheckRowDetail } from '@/components/CheckRow';
import { Divider } from '@/components/Divider';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { transactionAmountText } from '@/components/TransactionRow';
import { useCategories, type Category } from '@/data/categories';
import { useFixedCosts, type FixedCost } from '@/data/fixedCosts';
import { importKeys } from '@/data/imports';
import { useProfile } from '@/data/profile';
import { useAddTransactions, type TransactionItem } from '@/data/transactions';
import { categoryName } from '@/features/categories/categoryName';
import { useLanguage } from '@/i18n';
import { deviceTimeZone } from '@/i18n/format';
import { makeStyles, useTheme } from '@/theme';

import { importRequestError } from './errors';
import { formatFullDate, formatInstantDay, formatRowDay } from './format';
import {
  bookingDay,
  countByStatus,
  dryRunRows,
  importInfo,
  initialSelection,
  isSelectable,
  rowDescription,
  rowsToImport,
  selectAll,
  sourceKey,
  summarize,
  toPreviewRows,
  toggleSelection,
  type ImportSummary,
  type PreviewRow,
  type RowStatus,
} from './model';
import type { PickedFile } from './readFile';
import { SkippedLines } from './SkippedLines';
import { useMergeTargets } from './useMergeTargets';

const useStyles = makeStyles((theme) => ({
  list: { flex: 1 },
  grow: { flex: 1 },
  header: { gap: theme.layout.sectionGap, paddingBottom: theme.spacing.lg },
  card: { gap: theme.spacing.xs },
  checking: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  selectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  links: { flexDirection: 'row', gap: theme.spacing.md },
  link: { minHeight: theme.sizes.minTouchTarget, justifyContent: 'center' },
  pressed: { opacity: theme.opacity.pressed },
}));

function Separator() {
  return <Divider />;
}

const COUNT_KEYS = {
  new: 'imports.counts.new',
  merge: 'imports.counts.merge',
  imported_before: 'imports.counts.importedBefore',
  look_alike: 'imports.counts.lookAlike',
} as const satisfies Record<RowStatus, string>;

type ItemProps = {
  row: PreviewRow;
  checked: boolean;
  onToggle: (index: number) => void;
  language: Language;
  timeZone: string;
  /** The category or fixed cost the dry run placed the line in, already named. */
  placement: string | null;
  mergeTarget: TransactionItem | undefined;
};

/** One line of the file. Memoized: checking a line re-renders only that line. */
const PreviewItem = memo(function PreviewItem({
  row,
  checked,
  onToggle,
  language,
  timeZone,
  placement,
  mergeTarget,
}: ItemProps) {
  const { t } = useTranslation();
  const { transaction, status } = row;
  const testID = `import-row-${row.index}`;
  const day = formatRowDay(bookingDay(transaction), language);
  const describe = (merchant: string | null, amount: number, instant: string) =>
    t('imports.status.match', {
      merchant: merchant ?? t('imports.preview.noDescription'),
      amount: transactionAmountText(amount, language),
      day: formatInstantDay(instant, language, timeZone),
    });

  const details: CheckRowDetail[] = [];
  const placed = status === 'new' || status === 'merge';
  details.push({
    text: placed && placement && !row.needsReview ? `${day} · ${placement}` : day,
    testID: `${testID}-day`,
  });
  if (placed && row.needsReview) {
    details.push({
      text: t('imports.preview.needsCategory'),
      tone: 'warning',
      testID: `${testID}-review`,
    });
  }
  if (status === 'merge') {
    details.push({
      text: mergeTarget
        ? t('imports.status.merge', {
            match: describe(
              mergeTarget.merchant ?? mergeTarget.rawText,
              mergeTarget.amountRappen,
              mergeTarget.bookedAt,
            ),
          })
        : t('imports.status.mergeUnknown'),
      tone: 'accent',
      testID: `${testID}-status`,
    });
  } else if (status === 'imported_before') {
    details.push({ text: t('imports.status.importedBefore'), testID: `${testID}-status` });
  } else if (status === 'look_alike' && row.match) {
    details.push({
      text: t('imports.status.lookAlike', {
        match: describe(row.match.merchant, row.match.amountRappen, row.match.bookedAt),
      }),
      tone: 'warning',
      testID: `${testID}-status`,
    });
  }

  return (
    <CheckRow
      label={rowDescription(transaction) ?? t('imports.preview.noDescription')}
      value={transactionAmountText(transaction.amountRappen, language)}
      valueTone={transaction.amountRappen > 0 ? 'ok' : 'primary'}
      details={details}
      checked={checked}
      disabled={!isSelectable(row)}
      onToggle={() => onToggle(row.index)}
      testID={testID}
    />
  );
});

function placementOf(
  row: PreviewRow,
  categories: ReadonlyMap<string, Category>,
  fixedCosts: ReadonlyMap<string, FixedCost>,
  t: ReturnType<typeof useTranslation>['t'],
): string | null {
  const fixedCost = row.fixedCostId ? fixedCosts.get(row.fixedCostId) : undefined;
  if (fixedCost) {
    return t('imports.preview.fixedCost', {
      name: fixedCost.label ?? t(`fixedCostKinds.${fixedCost.kind}`),
    });
  }
  const category = row.categoryId ? categories.get(row.categoryId) : undefined;
  return category ? categoryName(category, t) : null;
}

/**
 * The preview of a parsed statement (US-3.2): period, number of transactions, skipped lines,
 * then every line marked by a dry run of the import as new, merging with a transaction the
 * person has, imported before, or looking like one they have. Lines are checked or unchecked
 * before "Import N transactions". The parsed file stays here while requests fail, so the person
 * can simply try again. A FlatList keeps files with thousands of lines responsive.
 */
export function ImportPreview({
  header,
  file,
  statement,
  onDone,
  onLeave,
}: {
  /** The screen's back row, kept above the list. */
  header: ReactNode;
  file: PickedFile;
  statement: ParsedStatement;
  onDone: (summary: ImportSummary) => void;
  /** Leaves the import, when the file holds nothing that can still be imported. */
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const timeZone = profile.data?.timezone ?? deviceTimeZone();
  const categories = useCategories();
  const fixedCosts = useFixedCosts();
  const check = useAddTransactions();
  const save = useAddTransactions();
  const { mutate: runCheckRequest } = check;
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<number>>(() => new Set());
  const info = useMemo(() => importInfo(file.name, statement), [file.name, statement]);

  // Rows appear only once the dry run answered; until then (or after a failure) the list is empty.
  const runCheck = useCallback(() => {
    runCheckRequest(
      { rows: dryRunRows(statement), import: info, dryRun: true },
      {
        onSuccess: (result) => {
          const preview = toPreviewRows(statement, result);
          setRows(preview);
          setSelection(initialSelection(preview));
        },
      },
    );
  }, [runCheckRequest, statement, info]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const toggle = useCallback(
    (index: number) => {
      const row = rows?.[index];
      if (row) setSelection((current) => toggleSelection(current, row));
    },
    [rows],
  );

  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category])),
    [categories.data],
  );
  const fixedCostMap = useMemo(
    () => new Map((fixedCosts.data ?? []).map((fixedCost) => [fixedCost.id, fixedCost])),
    [fixedCosts.data],
  );
  const mergeIds = useMemo(
    () => (rows ?? []).flatMap((row) => (row.mergeTargetId ? [row.mergeTargetId] : [])),
    [rows],
  );
  const mergeTargets = useMergeTargets(mergeIds);

  const counts = useMemo(() => countByStatus(rows ?? []), [rows]);
  const selectable = useMemo(() => (rows ?? []).filter(isSelectable).length, [rows]);
  const selectedCount = selection.size;
  const nothingNew = rows !== null && selectable === 0;

  const confirm = () => {
    if (!rows || selectedCount === 0) return;
    save.mutate(
      { rows: rowsToImport(rows, selection), import: info },
      {
        onSuccess: (result) => {
          void queryClient.invalidateQueries({ queryKey: importKeys.all });
          onDone(summarize(result));
        },
      },
    );
  };

  const source = t(sourceKey(statement.bank, statement.format));

  const listHeader = (
    <View style={styles.header}>
      <AppText variant="title" accessibilityRole="header">
        {t('imports.preview.title')}
      </AppText>
      <Card style={styles.card} testID="import-summary">
        <AppText variant="bodyStrong" testID="import-source">
          {source}
        </AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={1} ellipsizeMode="middle">
          {file.name}
        </AppText>
        {statement.from !== null && statement.to !== null ? (
          <AppText testID="import-period">
            {t('imports.preview.period', {
              from: formatFullDate(statement.from, language),
              to: formatFullDate(statement.to, language),
            })}
          </AppText>
        ) : null}
        <AppText testID="import-count">
          {t('imports.preview.count', { count: statement.rows.length })}
        </AppText>
      </Card>
      <SkippedLines skipped={statement.skipped} testID="import-skipped" />
      {check.isPending ? (
        <View style={styles.checking} testID="import-checking">
          <ActivityIndicator color={theme.colors.accent} />
          <AppText tone="secondary" style={styles.grow}>
            {t('imports.preview.checking')}
          </AppText>
        </View>
      ) : null}
      {check.isError ? (
        <AlertBanner
          tone="danger"
          title={t('imports.preview.checkFailed')}
          message={t(`imports.requestErrors.${importRequestError(check.error)}`)}
          actionLabel={t('common.retry')}
          onAction={runCheck}
          testID="import-check-error"
        />
      ) : null}
      {rows ? (
        <>
          <Card style={styles.card} testID="import-counts">
            {(Object.keys(COUNT_KEYS) as RowStatus[])
              .filter((status) => counts[status] > 0)
              .map((status) => (
                <AppText key={status} testID={`import-count-${status}`}>
                  {t(COUNT_KEYS[status], { count: counts[status] })}
                </AppText>
              ))}
            {counts.look_alike > 0 ? (
              <AppText variant="caption" tone="secondary">
                {t('imports.status.lookAlikeHint')}
              </AppText>
            ) : null}
          </Card>
          {nothingNew ? (
            <AlertBanner
              tone="info"
              message={t('imports.preview.nothingNew')}
              testID="import-nothing-new"
            />
          ) : null}
        </>
      ) : null}
      {rows && !nothingNew ? (
        <>
          <AppText tone="secondary" testID="import-hint">
            {t('imports.preview.hint')}
          </AppText>
          <View style={styles.selectRow}>
            <AppText variant="label" tone="secondary" testID="import-selected">
              {t('imports.preview.selected', { selected: selectedCount, total: selectable })}
            </AppText>
            <View style={styles.links}>
              {[
                {
                  label: t('imports.preview.selectAll'),
                  onPress: () => setSelection(selectAll(rows)),
                  testID: 'import-select-all',
                },
                {
                  label: t('imports.preview.selectNone'),
                  onPress: () => setSelection(new Set()),
                  testID: 'import-select-none',
                },
              ].map((link) => (
                <Pressable
                  key={link.testID}
                  onPress={link.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={link.label}
                  style={({ pressed }) => [styles.link, pressed && styles.pressed]}
                  testID={link.testID}
                >
                  <AppText variant="bodyStrong" tone="accent">
                    {link.label}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <Screen
      testID="import-screen"
      footer={
        <>
          {save.isError ? (
            <AlertBanner
              tone="danger"
              title={t('imports.preview.importFailed')}
              message={t(`imports.requestErrors.${importRequestError(save.error)}`)}
              testID="import-save-error"
            />
          ) : null}
          {nothingNew ? (
            <PrimaryButton
              label={t('imports.result.done')}
              onPress={onLeave}
              testID="import-nothing-done"
            />
          ) : (
            <PrimaryButton
              label={t('imports.preview.import', { count: selectedCount })}
              onPress={confirm}
              disabled={rows === null || selectedCount === 0}
              loading={save.isPending}
              testID="import-confirm"
            />
          )}
        </>
      }
    >
      {header}
      <FlatList
        style={styles.list}
        data={rows ?? []}
        keyExtractor={(row) => String(row.index)}
        extraData={selection}
        ListHeaderComponent={listHeader}
        ItemSeparatorComponent={Separator}
        initialNumToRender={20}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        testID="import-list"
        renderItem={({ item }) => (
          <PreviewItem
            row={item}
            checked={selection.has(item.index)}
            onToggle={toggle}
            language={language}
            timeZone={timeZone}
            placement={placementOf(item, categoryMap, fixedCostMap, t)}
            mergeTarget={item.mergeTargetId ? mergeTargets.get(item.mergeTargetId) : undefined}
          />
        )}
      />
    </Screen>
  );
}
