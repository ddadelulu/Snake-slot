import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './android/widgetTaskHandler';

/** Called once from the app entry (`index.ts`), before the app renders. */
export function registerWidgets(): void {
  registerWidgetTaskHandler(widgetTaskHandler);
}
