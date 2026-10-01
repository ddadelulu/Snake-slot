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
    bundleIdentifier: `${BASE_BUNDLE_ID}${SUFFIX[APP_ENV]}`,
    supportsTablet: false,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: `${BASE_BUNDLE_ID}${SUFFIX[APP_ENV]}`,
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
  },
});
