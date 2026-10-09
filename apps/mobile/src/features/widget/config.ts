import Constants from 'expo-constants';

/**
 * Names shared by the app, the config plugins (app.config.ts) and the native widget code. Keep
 * them in step with `targets/widget/BatzenWidget.swift` and the Android widget list in
 * app.config.ts.
 */

/** Key of the JSON snapshot in the shared store (App Group UserDefaults / AsyncStorage). */
export const WIDGET_SNAPSHOT_KEY = 'batzen.widget.snapshot';

/** WidgetKit `kind` of the iOS widget (reloaded after every write). */
export const IOS_WIDGET_KIND = 'BatzenWidget';

/** Android App Widget names (react-native-android-widget), one per size. */
export const ANDROID_WIDGET_NAMES = ['BatzenSmall', 'BatzenMedium'] as const;
export type AndroidWidgetName = (typeof ANDROID_WIDGET_NAMES)[number];

/** The App Group the app and the iOS widget extension share: `group.<bundle id>`. */
export function appGroupFor(bundleIdentifier: string): string {
  return `group.${bundleIdentifier}`;
}

/** The App Group of this build, from `extra.widget.appGroup` in app.config.ts. */
export function currentAppGroup(): string | null {
  const extra = Constants.expoConfig?.extra as { widget?: { appGroup?: unknown } } | undefined;
  const value = extra?.widget?.appGroup;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
