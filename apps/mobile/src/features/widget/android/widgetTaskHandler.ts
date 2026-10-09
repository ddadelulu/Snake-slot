import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { WIDGET_SNAPSHOT_KEY } from '../config';
import { parseWidgetSnapshot } from '../snapshot';
import { renderBatzenWidget } from './renderBatzenWidget';

/**
 * Runs in the background when Android adds, resizes or periodically updates a widget (also with
 * the app closed): it draws the stored snapshot for today's date. Clicks need no handling here,
 * since the widget only uses OPEN_APP and OPEN_URI.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY);
  } catch {
    stored = null;
  }
  props.renderWidget(
    renderBatzenWidget(props.widgetInfo.widgetName, parseWidgetSnapshot(stored), new Date()),
  );
}
