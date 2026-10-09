# Environments, CI and releases

Owner: **Vin Diesel**.

## Environments

| Environment | Supabase project          | App build                                         | Bundle id / package            |
| ----------- | ------------------------- | ------------------------------------------------- | ------------------------------ |
| development | local (`supabase start`)  | Expo Go or EAS profile `development` (dev client) | `com.ddadelulu.batzen.dev`     |
| staging     | hosted staging project    | EAS profile `staging` (internal distribution)     | `com.ddadelulu.batzen.staging` |
| production  | hosted production project | EAS profile `production` (stores)                 | `com.ddadelulu.batzen`         |

`APP_ENV` (set per EAS profile in `eas.json`) selects the bundle id suffix and app name suffix in
`app.config.ts`, so all three can be installed side by side. `APP_BUNDLE_ID` overrides the base id
(set it once the final name and developer accounts exist). Staging and production refuse plain
`http` backends.

Per-environment variables live in EAS (never in the repository):

| Variable                   | development       | staging             | production             |
| -------------------------- | ----------------- | ------------------- | ---------------------- |
| `EXPO_PUBLIC_SUPABASE_URL` | local URL         | staging project     | production project     |
| `EXPO_PUBLIC_SUPABASE_KEY` | local publishable | staging publishable | production publishable |

Set once by a human (needs a human: they exist only after the Expo and Apple accounts are set up):

| Variable         | What                                                           | Used for                                                                                                     |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `EAS_PROJECT_ID` | The EAS project id (`eas init`, or expo.dev → project)         | `extra.eas.projectId` in `app.config.ts`: Expo push tokens (M4-04). Left out of the config when not set.     |
| `APPLE_TEAM_ID`  | The Apple Developer team id (developer.apple.com → Membership) | `ios.appleTeamId`: signs the app and the widget extension ([WIDGETS.md](WIDGETS.md)). Left out when not set. |

Both go into the EAS environment variables of every profile (or the shell for local builds). The
iOS widget also needs the App Group `group.<bundle id>` registered for each bundle id; EAS
credentials offer to create it on the first build ([WIDGETS.md](WIDGETS.md#building-and-verifying)).

## CI

`.github/workflows/budget-app.yml` runs on every push and pull request that touches `budget-app/`:

1. **checks**: `npm ci`, Prettier, ESLint (no warnings), TypeScript, unit/component/route tests.
2. **database**: `supabase db start` (migrations applied), database tests, generated types must
   match the schema.
3. **e2e**: `supabase start` (database, auth, API), web build against it, Playwright.

A failing job blocks the merge. Playwright reports are uploaded when E2E fails.

## Database changes

`supabase db push` against staging first, run the database tests against a staging branch or a
copy, then production. Migrations are never edited after they reached a hosted project.

## Builds and store releases (M7)

`npx eas-cli build --profile production --platform all`, then `eas submit`. Crash reporting and
monitoring are chosen and wired in M7 together with the privacy review of what they collect.
