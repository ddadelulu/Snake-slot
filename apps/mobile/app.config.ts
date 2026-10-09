import type { ConfigContext, ExpoConfig } from 'expo/config';
import identity from '../../packages/core/src/app-identity.json';

/**
 * One app, three environments (docs/RELEASE.md). APP_ENV is set per EAS build profile; local
 * development defaults to "development". Each environment gets its own bundle id, so dev,
 * staging and production builds can sit side by side on one phone.
 */
type AppEnv = 'development' | 'staging' | 'production';

const APP_ENV: AppEnv = (() => {
  const value = process.env.APP_ENV ?? 'development';
  if (value === 'development' || value === 'staging' || value === 'production') return value;
  throw new Error(`APP_ENV must be development, staging or production (got "${value}")`);
})();

const BASE_BUNDLE_ID = process.env.APP_BUNDLE_ID ?? 'com.ddadelulu.batzen';
const SUFFIX: Record<AppEnv, string> = { development: '.dev', staging: '.staging', production: '' };
const NAME_SUFFIX: Record<AppEnv, string> = {
  development: ' Dev',
  staging: ' Staging',
  production: '',
};

const BUNDLE_ID = `${BASE_BUNDLE_ID}${SUFFIX[APP_ENV]}`;

/** Shared by the app and the iOS widget extension (src/features/widget/config.ts). */
const APP_GROUP = `group.${BUNDLE_ID}`;

/**
 * Light accent from the design tokens (src/theme/tokens.ts; a test keeps them equal). Used for
 * the Android notification icon tint.
 */
export const NOTIFICATION_COLOR = '#1F55C9';

/** The EAS project, set by a human once it exists (docs/RELEASE.md); needed for push tokens. */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID?.trim() || undefined;

/** Apple developer team, set by a human (docs/RELEASE.md); signs the app and the widget. */
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID?.trim() || undefined;

/**
 * Android home-screen widgets (react-native-android-widget, M4-10, docs/WIDGETS.md). The names
 * must match ANDROID_WIDGET_NAMES in src/features/widget/config.ts. Redrawn by the app after
 * every change and every 30 minutes by the system, which moves "per day" on after midnight.
 */
const ANDROID_WIDGETS = [
  {
    name: 'BatzenSmall',
    label: identity.name,
    description: 'Balance, per day, days until payday',
    minWidth: '110dp',
    minHeight: '110dp',
    targetCellWidth: 2,
    targetCellHeight: 2,
    resizeMode: 'none',
    updatePeriodMillis: 1_800_000,
  },
  {
    name: 'BatzenMedium',
    label: identity.name,
    description: 'Balance, per day, days until payday',
    minWidth: '250dp',
    minHeight: '110dp',
    targetCellWidth: 4,
    targetCellHeight: 2,
    resizeMode: 'horizontal',
    updatePeriodMillis: 1_800_000,
  },
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: `${identity.name}${NAME_SUFFIX[APP_ENV]}`,
  slug: 'batzen',
  scheme: identity.scheme,
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    ...(APPLE_TEAM_ID ? { appleTeamId: APPLE_TEAM_ID } : {}),
    supportsTablet: false,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
    entitlements: { 'com.apple.security.application-groups': [APP_GROUP] },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    'expo-localization',
    'expo-web-browser',
    [
      'expo-notifications',
      { icon: './assets/android-icon-monochrome.png', color: NOTIFICATION_COLOR },
    ],
    // Generates the WidgetKit extension from targets/widget on prebuild.
    '@bacons/apple-targets',
    ['react-native-android-widget', { widgets: ANDROID_WIDGETS }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 120,
        backgroundColor: '#FFFFFF',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#111316' },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    widget: { appGroup: APP_GROUP },
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
