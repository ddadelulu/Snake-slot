import type { Language } from '@budget/core';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Card, transactionAmountText } from '@/components';
import type { DuplicateMatch } from '@/data/transactions';
import { useLanguage } from '@/i18n';
import { makeStyles } from '@/theme';

import { formatWeekdayDate, localDayOf } from './format';

const useStyles = makeStyles((theme) => ({
  body: { gap: theme.spacing.md },
  match: {
    gap: theme.spacing.xxs,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
}));

/** Where the stored look-alike came from: "From your statement", "Added by hand", … */
export function lookAlikeSource(source: DuplicateMatch['source'], t: TFunction): string {
  if (source === 'manual') return t('quickAdd.lookAlike.byHand');
  if (source === 'statement_import') return t('quickAdd.lookAlike.fromStatement');
  return t('quickAdd.lookAlike.from', { source: t(`transactions.sources.${source}`) });
}

/** The look-alike as the card shows it: name (or "No name"), amount, day and source. */
export function describeLookAlike(
  match: DuplicateMatch,
  options: { language: Language; timeZone: string; t: TFunction },
): { name: string; amount: string; date: string; source: string } {
  const { language, timeZone, t } = options;
  return {
    name: match.merchant ?? t('quickAdd.lookAlike.noName'),
    amount: transactionAmountText(match.amountRappen, language),
    date: formatWeekdayDate(localDayOf(match.bookedAt, timeZone), language),
    source: lookAlikeSource(match.source, t),
  };
}

/**
 * Quick add found a stored transaction that looks like the new entry (D-040: same source, or
 * another source when the merchants cannot be compared). Shows what it looks like so the person
 * can decide; the buttons ("Add anyway", "Don't add") live in the screen's footer.
 */
export function LookAlikeCard({
  match,
  timeZone,
  testID,
}: {
  /** Null when the database did not describe it; the card then only asks. */
  match: DuplicateMatch | null;
  timeZone: string;
  testID: string;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { language } = useLanguage();
  const shown = match ? describeLookAlike(match, { language, timeZone, t }) : null;

  return (
    <Card testID={testID}>
      <View style={styles.body}>
        <AppText variant="heading" accessibilityRole="header">
          {t('quickAdd.lookAlike.title')}
        </AppText>
        <AppText>{t('quickAdd.lookAlike.message')}</AppText>
        {shown ? (
          <View
            style={styles.match}
            accessible
            accessibilityLabel={`${shown.name}, ${shown.amount}, ${shown.date}, ${shown.source}`}
            testID={`${testID}-match`}
          >
            <AppText variant="bodyStrong" testID={`${testID}-merchant`}>
              {shown.name}
            </AppText>
            <AppText numeric testID={`${testID}-when`}>
              {`${shown.amount} · ${shown.date}`}
            </AppText>
            <AppText tone="secondary" testID={`${testID}-source`}>
              {shown.source}
            </AppText>
          </View>
        ) : null}
        <AppText tone="secondary">{t('quickAdd.lookAlike.hint')}</AppText>
      </View>
    </Card>
  );
}
