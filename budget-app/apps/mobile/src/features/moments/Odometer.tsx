import type { Language, Rappen } from '@budget/core';
import { useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components';
import { makeStyles, useTheme } from '@/theme';

import { odometerSlots, wheelCount } from './odometer';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  wheel: { overflow: 'hidden' },
  currency: { marginEnd: theme.spacing.sm, marginBottom: theme.spacing.sm },
}));

export type OdometerProps = {
  from: Rappen;
  to: Rappen;
  /** The value on the wheels right now (between from and to). */
  value: number;
  language: Language;
  /** What a screen reader says: the new balance, never the rolling digits. */
  accessibilityLabel: string;
  tone?: 'primary' | 'danger';
  testID?: string;
};

/** The balance as rolling digit wheels (logic in odometer.ts). */
export function Odometer({
  from,
  to,
  value,
  language,
  accessibilityLabel,
  tone = 'primary',
  testID,
}: OdometerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const display = theme.typography.variants.display;
  const scale = Math.min(fontScale, display.maxFontSizeMultiplier ?? fontScale);
  const height = display.lineHeight * scale;
  const slots = odometerSlots(value, wheelCount(from, to), language);
  const negative = Math.round(value) < 0;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <AppText variant="heading" tone="secondary" style={styles.currency}>
        {negative ? 'CHF -' : 'CHF'}
      </AppText>
      {slots.map((slot) =>
        slot.kind === 'separator' ? (
          <AppText key={`s${slot.place}${slot.text}`} variant="display" tone={tone} numeric>
            {slot.text}
          </AppText>
        ) : (
          <View key={`d${slot.place}`} style={[styles.wheel, { height }]}>
            <View style={{ transform: [{ translateY: -slot.offset * height }] }}>
              <AppText variant="display" tone={tone} numeric>
                {String(slot.digit)}
              </AppText>
              <AppText variant="display" tone={tone} numeric>
                {String(slot.next)}
              </AppText>
            </View>
          </View>
        ),
      )}
    </View>
  );
}
