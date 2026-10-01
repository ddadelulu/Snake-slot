import { render, waitFor, type RenderOptions } from '@testing-library/react-native';
import { useEffect, type ReactElement, type ReactNode } from 'react';
import { SafeAreaProvider, type EdgeInsets, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider, useAppearance } from './ThemeProvider';

/** Test-only helpers. Not exported from the theme barrel so the app bundle never pulls them in. */

export type RenderWithThemeOptions = Omit<RenderOptions, 'wrapper'> & {
  /** Safe-area insets to simulate, e.g. a home indicator: `{ bottom: 34 }`. */
  insets?: Partial<EdgeInsets>;
};

function LoadedSignal({ onLoaded }: { onLoaded: () => void }) {
  const { loaded } = useAppearance();
  useEffect(() => {
    if (loaded) onLoaded();
  }, [loaded, onLoaded]);
  return null;
}

/**
 * Renders `ui` inside the same providers as the app root (safe area + theme) and resolves once
 * the saved appearance preference has been read, so tests never race the initial load.
 */
export async function renderWithTheme(ui: ReactElement, options: RenderWithThemeOptions = {}) {
  const { insets, ...renderOptions } = options;
  const metrics: Metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 0, right: 0, bottom: 0, left: 0, ...insets },
  };

  let loaded = false;
  const markLoaded = () => {
    loaded = true;
  };

  function Providers({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <LoadedSignal onLoaded={markLoaded} />
          {children}
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  const result = render(ui, { ...renderOptions, wrapper: Providers });
  await waitFor(() => {
    if (!loaded) throw new Error('The saved appearance preference has not been read yet');
  });
  return result;
}
