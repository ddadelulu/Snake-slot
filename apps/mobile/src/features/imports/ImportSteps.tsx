import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AlertBanner } from '@/components/AlertBanner';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { PrimaryButton } from '@/components/PrimaryButton';
import { makeStyles } from '@/theme';

import { formatMegabytes, type FileProblem, type ImportSummary } from './model';
import { SkippedLines } from './SkippedLines';

const useStyles = makeStyles((theme) => ({
  card: { gap: theme.spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  label: { flexShrink: 1 },
  actions: { gap: theme.spacing.md },
}));

/** What the import does and the one privacy promise, then the file picker. */
export function ImportIntro({ onChoose, reading }: { onChoose: () => void; reading: boolean }) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <>
      <AppText tone="secondary">{t('imports.intro.message')}</AppText>
      <AppText tone="secondary">{t('imports.intro.howTo')}</AppText>
      <Card style={styles.card}>
        <AppText variant="bodyStrong" testID="import-privacy">
          {t('imports.intro.privacy')}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {t('imports.intro.limits')}
        </AppText>
      </Card>
      <PrimaryButton
        label={t('imports.intro.choose')}
        onPress={onChoose}
        loading={reading}
        testID="import-choose"
      />
      {reading ? (
        <AppText tone="secondary" align="center" testID="import-reading">
          {t('imports.intro.reading')}
        </AppText>
      ) : null}
    </>
  );
}

function problemMessage(problem: FileProblem, t: TFunction): string {
  switch (problem.code) {
    case 'too_large':
      return t('imports.problems.too_large', { size: formatMegabytes(problem.maxBytes) });
    case 'too_many_rows':
      return t('imports.problems.too_many_rows', { count: problem.count, max: problem.max });
    default:
      return t(`imports.problems.${problem.code}`);
  }
}

/** Why the file cannot be imported, the skipped lines when that explains it, and a way on. */
export function FileProblemView({
  fileName,
  problem,
  onChooseAnother,
}: {
  fileName: string | null;
  problem: FileProblem;
  onChooseAnother: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <>
      <AlertBanner
        tone="danger"
        title={t('imports.problems.title')}
        message={problemMessage(problem, t)}
        testID={`import-problem-${problem.code}`}
      />
      {fileName ? (
        <AppText tone="secondary" numberOfLines={1} ellipsizeMode="middle">
          {fileName}
        </AppText>
      ) : null}
      {problem.code === 'no_transactions' ? (
        <SkippedLines skipped={problem.skipped} testID="import-problem-skipped" />
      ) : null}
      <View style={styles.actions}>
        <PrimaryButton
          label={t('imports.problems.chooseAnother')}
          onPress={onChooseAnother}
          testID="import-choose-another"
        />
      </View>
    </>
  );
}

function ResultRow({ label, count, testID }: { label: string; count: number; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${count}`} testID={testID}>
      <AppText style={styles.label}>{label}</AppText>
      <AppText variant="bodyStrong" numeric>
        {String(count)}
      </AppText>
    </View>
  );
}

/** How the import went: added, merged, already there, and how many still need a category. */
export function ImportResultView({ summary }: { summary: ImportSummary }) {
  const { t } = useTranslation();
  return (
    <Card testID="import-result">
      <ResultRow
        label={t('imports.result.added')}
        count={summary.added}
        testID="import-result-added"
      />
      <Divider />
      <ResultRow
        label={t('imports.result.merged')}
        count={summary.merged}
        testID="import-result-merged"
      />
      <Divider />
      <ResultRow
        label={t('imports.result.alreadyThere')}
        count={summary.alreadyThere}
        testID="import-result-already"
      />
      <Divider />
      <ResultRow
        label={t('imports.result.needsCategory')}
        count={summary.needsReview}
        testID="import-result-review"
      />
    </Card>
  );
}
