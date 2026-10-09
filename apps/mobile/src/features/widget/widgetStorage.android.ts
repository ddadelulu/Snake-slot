import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { renderBatzenWidget } from './android/renderBatzenWidget';
import { ANDROID_WIDGET_NAMES, WIDGET_SNAPSHOT_KEY } from './config';
import type { WidgetSnapshot } from './snapshot';

/**
 * Android: the snapshot is kept in AsyncStorage, where the widget task handler (run by the
 * system on updates, also when the app is closed) reads it, and every placed widget is redrawn.
 */
export const WIDGETS_SUPPORTED: boolean = true;

export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
  await Promise.all(
    ANDROID_WIDGET_NAMES.map((widgetName) =>
      requestWidgetUpdate({
        widgetName,
        renderWidget: () => renderBatzenWidget(widgetName, snapshot, new Date()),
      }),
    ),
  );
}
