# User stories

Owner: **Tom Hanks** (product). Stories are written from a normal user's point of view; each has
acceptance criteria that Daniel Craig turns into tests. Later milestones get their stories when
they start.

## Milestone 1 · Foundations

### US-1.1 Create an account with email and password

As someone trying the app, I want to sign up with my email and a password, so that my budget is
mine and safe.

- Email must look like an email address; the password needs at least 10 characters (no
  composition rules, at most 72 bytes). Problems show under the field before anything is sent.
- If the server requires email confirmation, I see "Check your inbox" with my address and can
  send the link again. The link opens the app and signs me in.
- If the address already has an account, I am told to sign in instead.
- The account starts in the language I see the app in.

_Tests:_ `e2e/auth.spec.ts`, `src/app/navigation.test.tsx`, `authApi.test.ts`, `triggers.test.ts`.

### US-1.2 Sign in, stay signed in, sign out

- Wrong email or password gives one clear message ("Email or password is wrong.") that does not
  reveal which part was wrong.
- After closing and reopening the app (or reloading the web build) I am still signed in.
- "Sign out" in Settings signs me out on this device and returns me to sign-in.
- Signed out, no tab can be opened, not even by link.

_Tests:_ `e2e/auth.spec.ts`, `navigation.test.tsx`, `AuthProvider.test.tsx`.

### US-1.3 Continue with Google or Apple

- The sign-in and sign-up screens offer "Continue with Google" and "Continue with Apple" when the
  project has them enabled, and hide them otherwise (no broken buttons).
- On iPhone, Apple uses the native Apple sheet and Apple's own button; elsewhere a browser sheet.
- Closing the sheet is not an error.

_Tests:_ `authApi.test.ts` (OAuth success, cancel, provider error, Apple nonce). Real provider
sign-in needs the credentials listed in the task board under "Needs a human".

### US-1.4 Forgot password

- "Forgot password?" asks for my email and always answers the same way, whether or not the address
  has an account.
- The emailed link opens the app on "Choose a new password"; the rest of the app stays closed until
  I save one (or sign out). After saving I land on Home with "Your new password is saved."

_Tests:_ `navigation.test.tsx` (recovery holds the user on the screen), `authApi.test.ts`
(redirect, code exchange).

### US-1.5 Find my way around

- Five tabs at the bottom: Home · Transactions · AI · Insights · Settings.
- Each tab says plainly what will appear there when it is empty; nothing pretends to work.
- A link into the app (e.g. to Settings) opens that screen after a cold start.

_Tests:_ `e2e/auth.spec.ts` (all tabs, deep link after cold start), `navigation.test.tsx`.

### US-1.6 German or English

- The app starts in my phone's language when it is German or English, otherwise German.
- I can switch in Settings; the whole app switches at once and remembers it.
- On a new phone I get the language I chose before (it is stored on my account).

_Tests:_ `e2e/preferences.spec.ts`, `catalogue.test.ts`, `LanguageProvider.test.tsx`,
`ProfileLanguageSync.test.tsx`.

### US-1.7 Light or dark

- The app follows my phone's light/dark setting, or I pick Light or Dark in Settings.
- All text stays readable in both (WCAG AA contrast), and the choice survives restarts.

_Tests:_ `e2e/preferences.spec.ts`, `contrast.test.ts`, `ThemeProvider.test.tsx`.

### US-1.8 Delete my account

- Settings → Delete account explains that everything is deleted for good, and asks me to confirm.
- "Keep my account" closes the sheet and nothing happens.
- After confirming, all my data is gone, I am signed out and see "Your account and all its data
  have been deleted."; signing in with the old password no longer works.

_Tests:_ `e2e/auth.spec.ts`, `account.test.ts` (every table emptied), `navigation.test.tsx`.

### Product review (Tom Hanks)

Checked every M1 screen in English and German, light and dark (screenshots in the M1 review).
Clear, calm and honest: empty tabs describe what will appear rather than promising features, error
messages say what to do next, and destructive actions are red and confirmed. Approved.
