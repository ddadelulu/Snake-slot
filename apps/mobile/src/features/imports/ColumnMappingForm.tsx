import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AlertBanner } from '@/components/AlertBanner';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ChipGroup } from '@/components/ChipGroup';
import { ChoiceChips } from '@/components/ChoiceChips';
import { ChoiceList } from '@/components/ChoiceList';
import { Divider } from '@/components/Divider';
import { ToggleChip } from '@/components/ToggleChip';
import { makeStyles } from '@/theme';

import {
  columnNames,
  columnSamples,
  mappingProblems,
  toggleTextColumn,
  type AmountKind,
  type MappingDraft,
  type MappingProblem,
  type UnknownColumns,
} from './model';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.sm },
  column: { gap: theme.spacing.xxs, paddingVertical: theme.spacing.sm },
}));

type ColumnRole = 'date' | 'amount' | 'debit' | 'credit';

const PROBLEM_KEY = {
  date: 'imports.mapping.missingDate',
  amount: 'imports.mapping.missingAmount',
  text: 'imports.mapping.missingText',
} as const satisfies Record<MappingProblem, string>;

/**
 * For a CSV file whose columns the app does not recognise: the columns with example values,
 * then which one holds the date, the amount (or debit and credit) and the description. Starts
 * from what the parser recognised.
 */
export function ColumnMappingForm({
  request,
  draft,
  onChange,
  showProblems,
  rejected,
}: {
  request: UnknownColumns;
  draft: MappingDraft;
  onChange: (draft: MappingDraft) => void;
  /** After a Continue with missing columns: say which ones. */
  showProblems: boolean;
  rejected: boolean;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const names = columnNames(request);
  const label = (column: number) =>
    names[column] ?? t('imports.mapping.column', { number: column + 1 });
  const options = names.map((_, column) => ({ value: String(column), label: label(column) }));
  const problems = mappingProblems(draft);

  const pick = (role: ColumnRole) => (
    <ChoiceChips<string>
      options={options}
      selected={draft[role] === null ? null : String(draft[role])}
      onSelect={(value) => onChange({ ...draft, [role]: Number(value) })}
      accessibilityLabel={t(`imports.mapping.${role}`)}
      testID={`import-map-${role}`}
    />
  );

  const section = (title: string, content: ReactNode, problem?: MappingProblem) => (
    <View style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {content}
      {showProblems && problem !== undefined && problems.includes(problem) ? (
        <AppText tone="danger" testID={`import-map-problem-${problem}`}>
          {t(PROBLEM_KEY[problem])}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <>
      {rejected ? (
        <AlertBanner tone="danger" message={t('imports.mapping.rejected')} testID="import-map-rejected" />
      ) : null}
      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('imports.mapping.columnsTitle')}
        </AppText>
        <Card>
          {names.map((_, column) => {
            const samples = columnSamples(request, column);
            return (
              <View key={column}>
                {column > 0 ? <Divider /> : null}
                <View
                  style={styles.column}
                  accessible
                  testID={`import-map-column-${column}`}
                  accessibilityLabel={`${label(column)}: ${samples.join(', ') || t('imports.mapping.noSample')}`}
                >
                  <AppText variant="bodyStrong">{label(column)}</AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={2}>
                    {samples.length > 0 ? samples.join(' · ') : t('imports.mapping.noSample')}
                  </AppText>
                </View>
              </View>
            );
          })}
        </Card>
      </View>
      {section(t('imports.mapping.date'), pick('date'), 'date')}
      {section(
        t('imports.mapping.amountKind'),
        <>
          <ChoiceList<AmountKind>
            options={[
              {
                value: 'single',
                label: t('imports.mapping.amountSingle'),
                description: t('imports.mapping.amountSingleHint'),
              },
              {
                value: 'split',
                label: t('imports.mapping.amountSplit'),
                description: t('imports.mapping.amountSplitHint'),
              },
            ]}
            selected={draft.amountKind}
            onSelect={(amountKind) => onChange({ ...draft, amountKind })}
            accessibilityLabel={t('imports.mapping.amountKind')}
            testID="import-map-amount-kind"
          />
          {draft.amountKind === 'single' ? (
            <View style={styles.section}>
              <AppText variant="label" tone="secondary">
                {t('imports.mapping.amount')}
              </AppText>
              {pick('amount')}
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <AppText variant="label" tone="secondary">
                  {t('imports.mapping.debit')}
                </AppText>
                {pick('debit')}
              </View>
              <View style={styles.section}>
                <AppText variant="label" tone="secondary">
                  {t('imports.mapping.credit')}
                </AppText>
                {pick('credit')}
              </View>
            </>
          )}
        </>,
        'amount',
      )}
      {section(
        t('imports.mapping.text'),
        <ChipGroup accessibilityLabel={t('imports.mapping.text')} testID="import-map-text">
          {names.map((_, column) => (
            <ToggleChip
              key={column}
              label={label(column)}
              selected={draft.text.includes(column)}
              onToggle={() => onChange(toggleTextColumn(draft, column))}
              testID={`import-map-text-${column}`}
            />
          ))}
        </ChipGroup>,
        'text',
      )}
    </>
  );
}
