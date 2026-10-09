import type { ExpoConfig } from 'expo/config';

import { darkTheme, lightTheme } from '@/theme/tokens';

import { ANDROID_WIDGET_NAMES, IOS_WIDGET_KIND, appGroupFor } from './config';

/** The native widget config must agree with the app code and the design tokens. */

function loadAppConfig(env: Record<string, string | undefined> = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  try {
    let result: { config: ExpoConfig; color: string } | undefined;
    jest.isolateModules(() => {
      const mod = require('../../../app.config');
      result = { config: mod.default({ config: {} }), color: mod.NOTIFICATION_COLOR };
    });
    return result!;
  } finally {
    process.env = saved;
  }
}

describe('app.config.ts', () => {
  it('shares the App Group group.<bundle id> with the widget and the app code', () => {
    const { config } = loadAppConfig({ APP_ENV: 'staging', APP_BUNDLE_ID: undefined });
    const group = appGroupFor('com.ddadelulu.batzen.staging');
    expect(config.ios?.entitlements?.['com.apple.security.application-groups']).toEqual([group]);
    expect(config.extra?.widget).toEqual({ appGroup: group });
  });

  it('declares both Android widget sizes under the names the app redraws', () => {
    const { config } = loadAppConfig();
    const plugin = config.plugins?.find(
      (entry) => Array.isArray(entry) && entry[0] === 'react-native-android-widget',
    ) as [string, { widgets: { name: string }[] }];
    expect(plugin[1].widgets.map((widget) => widget.name)).toEqual([...ANDROID_WIDGET_NAMES]);
    expect(config.plugins).toContain('@bacons/apple-targets');
  });

  it('tints notifications with the accent and reuses the monochrome icon', () => {
    const { config, color } = loadAppConfig();
    expect(color).toBe(lightTheme.colors.accent);
    expect(config.plugins).toContainEqual([
      'expo-notifications',
      { icon: './assets/android-icon-monochrome.png', color },
    ]);
  });

  it('reads the EAS project id from EAS_PROJECT_ID only when it is set', () => {
    expect(loadAppConfig({ EAS_PROJECT_ID: undefined }).config.extra?.eas).toBeUndefined();
    expect(loadAppConfig({ EAS_PROJECT_ID: ' 1234-abcd ' }).config.extra?.eas).toEqual({
      projectId: '1234-abcd',
    });
  });
});

describe('targets/widget/expo-target.config.js', () => {
  const target = require('../../../targets/widget/expo-target.config.js')({
    name: 'Batzen',
    ios: { entitlements: { 'com.apple.security.application-groups': ['group.x'] } },
  });

  it('uses the App Group of the app', () => {
    expect(target.entitlements).toEqual({ 'com.apple.security.application-groups': ['group.x'] });
    expect(target.name).toBe(IOS_WIDGET_KIND);
  });

  it('uses the design tokens for light and dark', () => {
    const pairs: [string, keyof typeof lightTheme.colors][] = [
      ['Background', 'surface'],
      ['$widgetBackground', 'surface'],
      ['Accent', 'accent'],
      ['$accent', 'accent'],
      ['TextPrimary', 'textPrimary'],
      ['TextSecondary', 'textSecondary'],
      ['OnAccent', 'textOnAccent'],
      ['Danger', 'statusDanger'],
    ];
    for (const [name, role] of pairs) {
      expect([name, target.colors[name]]).toEqual([
        name,
        { light: lightTheme.colors[role], dark: darkTheme.colors[role] },
      ]);
    }
  });
});
