import { localDateIn } from '@budget/core';
import type { WidgetRepresentation } from 'react-native-android-widget';

import { deviceTimeZone } from '@/i18n/format';
import { darkTheme, lightTheme } from '@/theme/tokens';

import type { AndroidWidgetName } from '../config';
import { widgetView, type WidgetSnapshot } from '../snapshot';
import { BatzenWidget } from './BatzenWidget';

/** Light and dark versions of a widget for the snapshot on the device's current date. */
export function renderBatzenWidget(
  widgetName: AndroidWidgetName | string,
  snapshot: WidgetSnapshot | null,
  now: Date,
): WidgetRepresentation {
  const view = widgetView(snapshot, localDateIn(now, deviceTimeZone()));
  const size = widgetName === 'BatzenSmall' ? 'small' : 'medium';
  return {
    light: <BatzenWidget size={size} view={view} colors={lightTheme.colors} />,
    dark: <BatzenWidget size={size} view={view} colors={darkTheme.colors} />,
  };
}
