import { StyleSheet } from 'react-native';

import { useTheme } from './ThemeProvider';
import type { Theme } from './tokens';

/**
 * Declares theme-dependent styles once, outside the component:
 *
 *   const useStyles = makeStyles((theme) => ({
 *     card: { backgroundColor: theme.colors.surface, padding: theme.layout.cardPadding },
 *   }));
 *
 *   function Card() {
 *     const styles = useStyles();
 *     return <View style={styles.card} />;
 *   }
 *
 * The StyleSheet is built once per theme (light and dark) and shared by every instance.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T,
): () => T {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (styles === undefined) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
