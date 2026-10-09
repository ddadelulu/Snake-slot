/**
 * iOS home-screen widget (WidgetKit extension, M4-10), generated into the Xcode project by
 * @bacons/apple-targets on `expo prebuild`. See docs/WIDGETS.md.
 *
 * Colours mirror the app's design tokens (src/theme/tokens.ts: surface, textPrimary,
 * textSecondary, accent, textOnAccent, statusDanger); a Jest test keeps them in step.
 * This file must stay CommonJS (the plugin does not load TypeScript or ESM).
 */

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'BatzenWidget',
  displayName: config.name,
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: { light: '#FFFFFF', dark: '#1A1D22' },
    $accent: { light: '#1F55C9', dark: '#7EA6FF' },
    // Named copies for SwiftUI (`Color("Background")`); the $-names feed build settings.
    Background: { light: '#FFFFFF', dark: '#1A1D22' },
    Accent: { light: '#1F55C9', dark: '#7EA6FF' },
    TextPrimary: { light: '#15181D', dark: '#F1F3F6' },
    TextSecondary: { light: '#555E6C', dark: '#A6AEBA' },
    OnAccent: { light: '#FFFFFF', dark: '#0B1530' },
    Danger: { light: '#C42B2B', dark: '#FF7070' },
  },
  entitlements: {
    // The same App Group as the app (app.config.ts): the widget reads the snapshot from it.
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
