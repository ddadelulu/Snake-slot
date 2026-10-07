import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Card, TextLink, transactionAmountText } from '@/components';
import type { TransactionItem } from '@/data/transactions';
import { useLanguage } from '@/i18n';
import { makeStyles } from '@/theme';

import { formatForeignAmount, formatTime, formatWeekdayDate, localDayOf } from './format';

const useStyles = makeStyles((theme) => ({
  top: { gap: theme.spacing.xs },
  facts: { gap: theme.spacing.xs },
  rawText: { gap: theme.spacing.xs },
  toggle: { alignSelf: 'flex-start' },
}));

/** Statement texts longer than this start folded. */
const FOLDED_LENGTH = 90;

/**
 * What is known about a transaction (US-3.4): amount (money in with +), merchant, local date and
 * time, where it came from, a foreign amount and the statement text.
 */
export function TransactionFacts({
  transaction,
  timeZone,
}: {
  transaction: TransactionItem;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { language } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const moneyIn = transaction.amountRappen > 0;
  const day = localDayOf(transaction.bookedAt, timeZone);
  const rawText = transaction.rawText;
  const foldable = rawText !== null && (rawText.length > FOLDED_LENGTH || rawText.includes('\n'));

  const source =
    transaction.source === 'manual'
      ? t('transactionDetail.sourceManual')
      : transaction.source === 'statement_import'
        ? transaction.dataSourceName
          ? t('transactionDetail.sourceStatement', { name: transaction.dataSourceName })
          : t('transactionDetail.sourceStatementUnnamed')
        : t('transactionDetail.sourceOther', {
            source: t(`transactions.sources.${transaction.source}`),
          });
  const alsoSeen = transaction.mergedSources
    .filter((merged) => merged !== transaction.source)
    .map((merged) => t(`transactions.sources.${merged}`));

  return (
    <>
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header" testID="detail-merchant-title">
          {transaction.merchant ??
            (moneyIn
              ? t('transactionDetail.noMerchantMoneyIn')
              : t('transactionDetail.noMerchant'))}
        </AppText>
        <AppText variant="display" numeric tone={moneyIn ? 'ok' : 'primary'} testID="detail-amount">
          {transactionAmountText(transaction.amountRappen, language)}
        </AppText>
      </View>
      <View style={styles.facts}>
        <AppText testID="detail-when">
          {t('transactionDetail.when', {
            date: formatWeekdayDate(day, language, { year: true }),
            time: formatTime(transaction.bookedAt, language, timeZone),
          })}
        </AppText>
        <AppText tone="secondary" testID="detail-source">
          {source}
        </AppText>
        {alsoSeen.length > 0 ? (
          <AppText tone="secondary" testID="detail-also-seen">
            {t('transactionDetail.alsoSeenIn', { sources: [...new Set(alsoSeen)].join(', ') })}
          </AppText>
        ) : null}
        {transaction.original ? (
          <AppText tone="secondary" testID="detail-foreign">
            {t('transactionDetail.foreignAmount', {
              amount: formatForeignAmount(
                transaction.original.amountMinor,
                transaction.original.currency,
                language,
              ),
            })}
          </AppText>
        ) : null}
      </View>
      {rawText !== null ? (
        <Card>
          <View style={styles.rawText}>
            <AppText variant="label" tone="secondary">
              {t('transactionDetail.statementText')}
            </AppText>
            <AppText
              selectable
              numberOfLines={foldable && !expanded ? 2 : undefined}
              testID="detail-raw-text"
            >
              {rawText}
            </AppText>
            {foldable ? (
              <View style={styles.toggle}>
                <TextLink
                  label={
                    expanded ? t('transactionDetail.showLess') : t('transactionDetail.showMore')
                  }
                  onPress={() => setExpanded((current) => !current)}
                  testID="detail-raw-text-toggle"
                />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
    </>
  );
}
