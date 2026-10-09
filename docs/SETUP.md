# Setup guide

Owner: **Morgan Freeman**. From a fresh clone to the app running against a local backend.

## Prerequisites

- Node.js 22 and npm 10
- Docker (for the local Supabase stack)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) 2.x
- For phones: Expo Go for a first look, or a development build (needed for Sign in with Apple and
  other native modules): Xcode for iOS, Android Studio for Android, or EAS Build in the cloud

## 1. Install

```sh
git clone -b budget-app https://github.com/ddadelulu/Snake-slot.git batzen && cd batzen
npm install
```

## 2. Start the local backend

```sh
supabase start          # from the repository root; applies supabase/migrations
supabase status         # prints the API URL and the publishable/anon key
```

Local services: API `http://127.0.0.1:54321`, database `127.0.0.1:54322`, Studio
`http://127.0.0.1:54323`, email inbox (all sent emails) `http://127.0.0.1:54324`.

Locally, new accounts work without email confirmation; emails such as password resets still
arrive in the inbox above. To try the confirmation flow, set `enable_confirmations = true` under
`[auth.email]` in `supabase/config.toml` and run `supabase stop && supabase start`.

## 3. Configure the app

```sh
cp apps/mobile/.env.example apps/mobile/.env.local
```

Fill in `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and `EXPO_PUBLIC_SUPABASE_KEY` with the
publishable (or anon) key from `supabase status`. Never put the service-role/secret key here: the
app refuses to start with one. On a physical phone use your computer's LAN address
(e.g. `http://192.168.1.20:54321`); the Android emulator reaches the computer at `10.0.2.2`.

## 4. Run

```sh
cd apps/mobile
npx expo start          # press i (iOS), a (Android) or w (web)
```

Development builds: `npx expo run:ios` / `npx expo run:android`, or
`npx eas-cli build --profile development`.

## 5. Check everything

```sh
git clone -b budget-app https://github.com/ddadelulu/Snake-slot.git batzen && cd batzen
npm run format:check && npm run lint && npm run typecheck && npm test   # what CI runs first
npm run test:db                                                          # needs supabase start
```

End-to-end tests: see [TESTING.md](TESTING.md#end-to-end-tests).

## Google and Apple sign-in

The buttons appear automatically once a provider is enabled in the Supabase project.

- **Google:** create an OAuth client (type "Web application") in Google Cloud. Authorized redirect
  URI: `https://<project-ref>.supabase.co/auth/v1/callback` (locally
  `http://127.0.0.1:54321/auth/v1/callback`). Put the client id and secret into the Supabase
  dashboard (Authentication → Providers → Google), or locally into
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` and set
  `enabled = true` under `[auth.external.google]`.
- **Apple:** in the Apple Developer account enable "Sign in with Apple" for the app id(s)
  `com.ddadelulu.batzen` (`.dev`, `.staging`), create a Services ID for the browser flow and a
  key. In Supabase (Authentication → Providers → Apple) list the Services ID and the bundle ids as
  client ids and add the secret generated from the key. Native iOS sign-in needs a development
  build (not Expo Go).

## Hosted projects (staging, production)

Set in the Supabase dashboard to match `supabase/config.toml`:

- Region: Zurich (`eu-central-2`) if available on the plan, otherwise Frankfurt (`eu-central-1`)
  ([PRIVACY.md](PRIVACY.md#hosting)).
- Authentication: minimum password length 10, email confirmation on, secure password change on,
  leaked-password protection on (paid plans), redirect URLs `batzen://auth/callback**` (and the
  `.dev`/`.staging` variants used by those builds).
- API: exposed schemas `public` only (never `internal` or `private`, D-038); no extra search
  path; GraphQL (pg_graphql) disabled, the app does not use it. Check this before every release
  (SECURITY.md, "Before release").
- Apply migrations with `supabase link --project-ref <ref>` and `supabase db push`.
- EAS environment variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` per
  environment ([RELEASE.md](RELEASE.md)).

## Renaming the app

Edit `packages/core/src/app-identity.json` (name and deep-link scheme). Then update the redirect
allow-lists (`supabase/config.toml` and the hosted projects) and, before the first store build,
`APP_BUNDLE_ID` ([RELEASE.md](RELEASE.md)).
