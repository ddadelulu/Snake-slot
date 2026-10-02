import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

export type DayGridProps = {
  /** The chosen day of the month (1–31), or null while nothing is chosen. */
  selected: number | null;
  onSelect: (day: number) => void;
  /** Translated screen-reader label of one day, e.g. `(day) => \`${day}.\`` → "25.". */
  dayLabel: (day: number) => string;
  /** Names the group for screen readers, e.g. "Payday". */
  accessibilityLabel: string;
  /** Each day gets `${testID}-${day}`. */
  testID?: string;
};

const DAYS_IN_LONGEST_MONTH = 31;
const COLUMNS = 7;

const WEEKS: (number | null)[][] = Array.from(
  { length: Math.ceil(DAYS_IN_LONGEST_MONTH / COLUMNS) },
  (_, week) =>
    Array.from({ length: COLUMNS }, (_, column) => {
      const day = week * COLUMNS + column + 1;
      return day <= DAYS_IN_LONGEST_MONTH ? day : null;
    }),
);

const useStyles = makeStyles((theme) => ({
  grid: { gap: theme.spacing.xxs },
  week: { flexDirection: 'row' },
  // The whole seventh of the row is the touch target; the drawn cell sits inside it.
  slot: { flex: 1, minHeight: theme.sizes.dayCellHeight, padding: theme.spacing.xxs },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.thin,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pressed: { backgroundColor: theme.colors.surfaceMuted },
  selected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  selectedPressed: {
    backgroundColor: theme.colors.accentPressed,
    borderColor: theme.colors.accentPressed,
  },
}));

/** Picks a day of the month, e.g. payday. Days 29–31 are offered; the caller handles short months. */
export function DayGrid({
  selected,
  onSelect,
  dayLabel,
  accessibilityLabel,
  testID,
}: DayGridProps) {
  const styles = useStyles();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={styles.grid}
    >
      {WEEKS.map((week, index) => (
        <View key={`week-${index}`} style={styles.week}>
          {week.map((day, column) => {
            if (day === null) return <View key={`empty-${column}`} style={styles.slot} />;
            const checked = day === selected;
            return (
              <Pressable
                key={day}
                onPress={() => {
                  if (!checked) onSelect(day);
                }}
                accessibilityRole="radio"
                accessibilityLabel={dayLabel(day)}
                accessibilityState={{ checked }}
                testID={testID === undefined ? undefined : `${testID}-${day}`}
                style={styles.slot}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.cell,
                      pressed && styles.pressed,
                      checked && styles.selected,
                      checked && pressed && styles.selectedPressed,
                    ]}
                  >
                    {/* Follows the text size, shrinking only where a seventh of the row runs out. */}
                    <AppText
                      variant={checked ? 'bodyStrong' : 'body'}
                      tone={checked ? 'onAccent' : 'primary'}
                      numeric
                      align="center"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {String(day)}
                    </AppText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
