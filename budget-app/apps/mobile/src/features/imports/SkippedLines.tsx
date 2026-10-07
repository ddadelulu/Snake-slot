import type { SkippedRow } from '@budget/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { makeStyles } from '@/theme';

import { groupSkipped } from './model';

/** Long files can skip hundreds of lines; beyond this many per reason only the count is shown. */
export const MAX_LINES_PER_REASON = 50;

const useStyles = makeStyles((theme) => ({
  card: { gap: theme.spacing.sm },
  toggle: {
    alignSelf: 'flex-start',
    minHeight: theme.sizes.minTouchTarget,
    justifyContent: 'center',
  },
  pressed: { opacity: theme.opacity.pressed },
  group: { gap: theme.spacing.xxs, paddingTop: theme.spacing.xs },
}));

/**
 * The lines of a statement that are not imported, with the reason (not booked yet, not in CHF,
 * …), so nothing is lost silently. The reasons with their counts are always visible; the lines
 * themselves (number and text) open on request.
 */
export function SkippedLines({
  skipped,
  testID,
}: {
  skipped: readonly SkippedRow[];
  testID: string;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupSkipped(skipped), [skipped]);
  if (groups.length === 0) return null;

  return (
    <Card style={styles.card} testID={testID}>
      <AppText variant="bodyStrong">
        {t('imports.preview.skipped', { count: skipped.length })}
      </AppText>
      <AppText variant="caption" tone="secondary" testID={`${testID}-reasons`}>
        {groups
          .map((group) => `${t(`imports.skipReasons.${group.reason}`)} (${group.rows.length})`)
          .join(' · ')}
      </AppText>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          open ? t('imports.preview.hideSkipped') : t('imports.preview.showSkipped')
        }
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        testID={`${testID}-toggle`}
      >
        <AppText variant="bodyStrong" tone="accent">
          {open ? t('imports.preview.hideSkipped') : t('imports.preview.showSkipped')}
        </AppText>
      </Pressable>
      {open
        ? groups.map((group) => {
            const hidden = group.rows.length - MAX_LINES_PER_REASON;
            return (
              <View key={group.reason} style={styles.group} testID={`${testID}-${group.reason}`}>
                <AppText variant="label" accessibilityRole="header">
                  {t(`imports.skipReasons.${group.reason}`)}
                </AppText>
                {group.rows.slice(0, MAX_LINES_PER_REASON).map((row) => (
                  <AppText
                    key={row.line}
                    variant="caption"
                    tone="secondary"
                    numberOfLines={2}
                    testID={`${testID}-line-${row.line}`}
                  >
                    {`${t('imports.preview.line', { line: row.line })}: ${row.text}`}
                  </AppText>
                ))}
                {hidden > 0 ? (
                  <AppText variant="caption" tone="secondary">
                    {t('imports.preview.moreLines', { count: hidden })}
                  </AppText>
                ) : null}
              </View>
            );
          })
        : null}
    </Card>
  );
}
