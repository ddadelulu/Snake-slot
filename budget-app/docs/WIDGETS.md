# Home-screen widgets (M4-10)

Owners: **Vin Diesel** (builds) and **Robert Downey Jr.** (frontend). Decision D-044.

Batzen has a home-screen widget on iOS (WidgetKit) and Android (App Widget), in a small (2×2)
and a medium (4×2) size, light and dark, in the app's language (de/en). It shows:

- the balance left this month (CHF, Swiss formatting, red when below zero),
- the amount per day,
- the days until payday,
- a **+** that opens quick add (`batzen://add`).

After sign-out it shows only "Open Batzen" / "Batzen öffnen": no amounts stay on the home screen.

## How it works

```
useOverview() success ──► WidgetSync (root layout) ──► buildWidgetSnapshot() ──► writeWidgetSnapshot()
sign-out ───────────────►                          └─► neutralSnapshot()      ├─ iOS: App Group UserDefaults + WidgetCenter reload
                                                                              ├─ Android: AsyncStorage + redraw both widget sizes
                                                                              └─ web: nothing
```

- **One snapshot, formatted in the app.** `src/features/widget/snapshot.ts` builds a small JSON
  object with every text already formatted by `formatChf` and the i18n catalogue (`home.*`,
  `widget.*`): `balanceText`, `perDayText`, `daysText`, `daysLabel`, `labels`, `message`,
  `addUrl`, `language`, `updatedAt`. Native code never formats money.
- **Right at midnight without the app.** `days` holds one entry per day from today to the day
  before payday, computed by the shared engine (`toHomeModel` with a later `today`, as if nothing
  else were spent). The widgets show the entry for the device's date. From payday on they show
  "New month: open Batzen" instead of last month's numbers.
- **When it is written.** `WidgetSync` (mounted once in `src/app/_layout.tsx`) writes after every
  successful overview fetch (app start, return to the foreground, every booking, since they
  invalidate the overview) and after sign-out. Writes that would not change what is shown are
  skipped.
- **iOS.** `@bacons/apple-targets` generates the WidgetKit extension from `apps/mobile/targets/widget`
  on prebuild (`BatzenWidget.swift`, `expo-target.config.js`). The app and the extension share
  the App Group `group.<bundle id>` (per environment, from `app.config.ts`); the app writes with
  the package's `ExtensionStorage` and reloads the timeline of kind `BatzenWidget`. The timeline
  has one entry now and one at every midnight up to payday, and asks for a new one at the next
  midnight. The small widget is a single tap target, so the whole small widget opens quick add;
  the medium widget opens the app and its **+** opens quick add.
- **Android.** `react-native-android-widget` (config plugin in `app.config.ts`, widgets
  `BatzenSmall` and `BatzenMedium`) renders the JSX in `src/features/widget/android/`. The app
  stores the snapshot in AsyncStorage and redraws both sizes; the system runs the registered
  task handler (`index.ts` → `registerWidgets.android.ts`) when a widget is added or resized and
  every 30 minutes, also with the app closed, so the day moves on shortly after midnight. Light
  and dark come from the design tokens. The **+** is an `OPEN_URI` click to `batzen://add`; the
  rest opens the app.
- **Colours.** Both platforms use the tokens in `src/theme/tokens.ts` (surface, text, accent,
  danger). The iOS colours are copied into `expo-target.config.js` (CommonJS only); a test fails
  if they drift.

Files: `apps/mobile/src/features/widget/*`, `apps/mobile/targets/widget/*`, `apps/mobile/index.ts`,
`apps/mobile/app.config.ts`. Generated on prebuild and not committed:
`targets/*/Assets.xcassets`, `targets/*/Info.plist`, `ios/`, `android/`.

## Building and verifying

Widgets need a development build (not Expo Go, not the web build).

1. Once (needs a human): set `EAS_PROJECT_ID` and `APPLE_TEAM_ID` ([RELEASE.md](RELEASE.md)).
   On the first iOS build EAS asks to register the widget's bundle id
   (`<bundle id>.widget`) and the App Group `group.<bundle id>`; accept both.
2. Build: `cd apps/mobile && npx eas-cli build --profile development --platform ios` (simulator:
   add `"ios": { "simulator": true }` to the profile or use `npx expo run:ios` on a Mac with
   Xcode) and `--platform android` (or `npx expo run:android`).
3. Install, sign in, open Home once.
4. Add the widget: iOS long-press the home screen → **+** → Batzen; Android long-press →
   Widgets → Batzen. Add both sizes.

Check on each platform, in light and dark mode and in German and English:

| Check                                                         | Expected                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| Widget after opening Home                                     | Same balance, per day and days as Home, same formatting     |
| Book an expense in quick add, go to the home screen           | Widget shows the new balance within a few seconds           |
| Tap **+** (medium) / the widget (small iOS) / **+** (Android) | Quick add opens                                             |
| Switch the app language in Settings, return to Home           | Widget texts switch language                                |
| Sign out                                                      | Widget shows only "Open Batzen", no amounts                 |
| Set the device clock past midnight (or wait)                  | Days until payday goes down by one, per day is recalculated |
| Device date on or after payday without opening the app        | "New month: open Batzen"                                    |
| Overspent month                                               | Balance in red                                              |

## Verified here vs. needs a device

Verified in this environment (Linux, no simulators):

- Jest: snapshot building (German/English formatting, one entry per day to payday, overspent,
  no data after sign-out), parsing, the day-picking rule, the sync component (writes after a
  fetch, once per change, neutral on sign-out, nothing while loading, no-op on the web), the
  iOS and Android storage writers, the Android widget tree (texts, deep link, light/dark
  colours, midnight and payday) and its task handler, and the config (App Group, widget names,
  notification colour, EAS project id, iOS colours equal the tokens).
- `npx expo config --type public` succeeds; `npx expo prebuild --no-install` for Android and iOS
  succeeds in a scratch copy: Android gets both widget receivers and provider XML, iOS gets the
  `BatzenWidget` extension target (`<bundle id>.widget`, iOS 17) with the App Group entitlement
  on both targets.
- The web build exports. The iOS and Android JS bundles build once the route tests are left out:
  `expo export --platform android` fails on the route tests inside `src/app/*.test.tsx`, which
  Expo Router bundles on native and which import Node-only test helpers. This predates the
  widgets and blocks every native build; the tests need to move out of `src/app` (open item).

Needs a device or simulator (not possible here):

- Compiling the Swift extension and the Android widget classes, signing with the App Group.
- Everything in the check list above.
