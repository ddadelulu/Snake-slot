import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Card, PrimaryButton } from '@/components';
import { makeStyles } from '@/theme';

const useStyles = makeStyles((theme) => ({
  body: { gap: theme.spacing.md },
  text: { gap: theme.spacing.xs },
}));

export type RuleQuestionProps = {
  /** The merchant key the rule will match, e.g. "manor". */
  pattern: string;
  /** The chosen category's display name. */
  categoryName: string;
  onYes: () => void;
  onNo: () => void;
  /** Which answer is being saved, if any. */
  saving: 'yes' | 'no' | null;
  /** Prefix of the buttons' testIDs: `${testIDPrefix}-rule-yes` and `${testIDPrefix}-rule-no`. */
  testIDPrefix: string;
};

/**
 * "Always do this for “manor”?" (US-3.3), asked after the person chooses a category. Yes saves
 * the category together with a rule; "Only this time" saves the category alone.
 */
export function RuleQuestion({
  pattern,
  categoryName,
  onYes,
  onNo,
  saving,
  testIDPrefix,
}: RuleQuestionProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <Card testID={`${testIDPrefix}-rule`}>
      <View style={styles.body}>
        <View style={styles.text}>
          <AppText variant="heading" accessibilityRole="header">
            {t('review.rule.question', { pattern })}
          </AppText>
          <AppText tone="secondary">
            {t('review.rule.explanation', { pattern, category: categoryName })}
          </AppText>
        </View>
        <PrimaryButton
          label={t('review.rule.yes')}
          onPress={onYes}
          loading={saving === 'yes'}
          disabled={saving === 'no'}
          testID={`${testIDPrefix}-rule-yes`}
        />
        <PrimaryButton
          variant="secondary"
          label={t('review.rule.no')}
          onPress={onNo}
          loading={saving === 'no'}
          disabled={saving === 'yes'}
          testID={`${testIDPrefix}-rule-no`}
        />
      </View>
    </Card>
  );
}
