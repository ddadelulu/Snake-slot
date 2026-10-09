/**
 * Where the widget snapshot goes. Metro picks the platform file: `widgetStorage.ios.ts` (App
 * Group UserDefaults + WidgetKit reload), `widgetStorage.android.ts` (AsyncStorage + App Widget
 * redraw) or `widgetStorage.web.ts` (no-op). This file only gives TypeScript one module to check
 * imports against; any other platform gets the no-op.
 */
export * from './widgetStorage.web';
