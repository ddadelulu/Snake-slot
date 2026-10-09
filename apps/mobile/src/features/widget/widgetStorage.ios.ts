import { ExtensionStorage } from '@bacons/apple-targets';

import { IOS_WIDGET_KIND, WIDGET_SNAPSHOT_KEY, currentAppGroup } from './config';
import type { WidgetSnapshot } from './snapshot';

/** iOS: the snapshot goes to the App Group's UserDefaults, then WidgetKit redraws the widget. */
export const WIDGETS_SUPPORTED: boolean = true;

export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  const appGroup = currentAppGroup();
  if (!appGroup) return;
  new ExtensionStorage(appGroup).set(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
  ExtensionStorage.reloadWidget(IOS_WIDGET_KIND);
}
