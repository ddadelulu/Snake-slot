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

## Milestone 2 · Onboarding, budget engine, home screen

### US-2.1 Set up my month in under five minutes

As a new user, I want a short questionnaire that turns my income and bills into a budget, so I
start with a plan instead of a blank screen.

- One topic per screen, with a progress bar ("Step 3 of 9"), a back button on every step after the
  first, and Skip on optional steps (saving, how I pay, warnings).
- Steps: income (net income, payday, irregular income, hours per week), fixed costs (rent, health
  insurance, phone/internet, travel pass, other insurance, subscriptions, tax provision,
  leasing/debts, other), saving (monthly amount and/or a goal; what happens to money left at the
  end of the month), categories (the ten defaults plus my own), budgets, how I pay, pain level,
  warnings, summary.
- Amounts accept Swiss and English notation (`1’250.50`, `1250,50`, `1,250`).
- Closing the app keeps my answers; I continue where I stopped.
- A new user can go from sign-up to a correct budget in under five minutes (tested end to end).

_Tests:_ `draft.test.ts`, `onboarding.test.tsx`, `e2e/onboarding.spec.ts`.

### US-2.2 A sensible budget suggestion I can adjust

- After fixed costs and saving, what is left is split across my categories (in CHF 5 steps,
  weighted by typical spending), and I adjust each with a slider.
- I always see what there is to spend and how much is in budgets. If budgets exceed what I have,
  I see by how much; if fixed costs and saving exceed my income, I am told to check my numbers.
- "Use the suggested split" undoes my changes.

_Tests:_ `suggest.test.ts`, `plan.test.ts`, `draft.test.ts`, `onboarding.test.tsx`.

### US-2.3 "Your month" before I commit

- The summary shows the period (payday to the day before the next payday), income, fixed costs,
  saving, what is left to spend and every budget. "Start my month" saves everything at once;
  if saving fails nothing is half-stored and I can try again.

_Tests:_ `onboarding.test.ts` (database: atomic), `onboarding.test.tsx`, E2E.

### US-2.4 My balance like a bank balance

- Home shows "CHF … left this month", what I can spend per day and the days until payday.
- Each category shows what is left of its budget with a bar that turns orange at 80 % and red at
  100 %; overspending shows in red with the amount over.
- A line tells me whether my money lasts until payday at the current pace, or the date it runs
  out.
- The last five purchases are listed with category and date.
- Refunds give money back to their category; purchases not yet categorized still reduce my
  balance; incoming money that is not a refund does not inflate it.

_Tests:_ `overview.test.ts` (engine and database), `home.test.tsx`, E2E.

### US-2.5 The month resets on payday

- On payday a new month starts automatically with the same budgets. Money left over is carried
  into the new month, moved to savings, or dropped, as I chose; with "carry over", a deficit is
  carried too.
- Missing several paydays (app not opened) rolls each month in turn; nothing is skipped.

_Tests:_ `rollover.test.ts` (database), `leftover.test.ts`, `period.test.ts`.

## Milestone 3 · Manual add, statement import, categorization

Written by Tom Hanks (product), reviewed by Samuel L. Jackson.

### US-3.1 Add a cash purchase in under five seconds

As someone who just paid cash, I want to record it before I forget, so my balance stays true.

- The "+" button on Home (and the link `batzen://add`) opens Add with the amount field focused
  and my categories as one-tap buttons; Save is always visible. Amount, category, Save: done.
- Optional: money in (a refund), where, a note, another day (today, yesterday or one of the last
  two weeks), and splitting the amount across categories (the parts must add up exactly).
- Home updates at once. If the same purchase already came from my statement, the app says so
  and keeps one transaction.

### US-3.2 Import my bank statement

As a user whose bank is not connected yet, I want to import the statement my e-banking exports,
so my card and Twint payments are tracked without typing them.

- I pick a file: camt.053 (XML) or the CSV export of my bank. PostFinance, UBS, Zürcher
  Kantonalbank, Raiffeisen, Neon and Revolut are recognized by their columns; for any other CSV I
  choose which column holds the date, the amount (or debit and credit) and the text.
- The file is read on my phone; only the transactions I keep are saved.
- Before saving I see the period, how many transactions there are, which rows were skipped and
  why (not booked yet, not in CHF, …), which ones I imported before, and look-alikes of
  transactions I already have (unchecked). I can uncheck anything, e.g. transfers to my own
  savings account or credit-card bill payments.
- Importing the same file again adds nothing. Purchases I typed in by hand are merged with
  their statement line instead of counting twice; payments of my fixed costs (rent, health
  insurance, phone) are recognized and do not reduce my budget a second time.
- I can undo an import in Settings → Data sources.

### US-3.3 The right category without effort

- Each transaction is placed by my own rules first, then by a list of known Swiss merchants,
  then by the card's merchant category code. Anything the app is not sure about is asked:
  "CHF 84.00 at Manor: what was it?" with my categories as buttons (Home shows how many are
  waiting; the Transactions tab lists them).
- After I correct a category I am asked "Always do this for Manor?"; yes creates a rule and
  re-sorts my earlier Manor purchases that I did not place myself. Rules are listed in
  Settings, where I can delete them.

### US-3.4 Find and fix any transaction

- The Transactions tab lists everything newest first, with search (merchant, note, statement
  text) and filters for category (including "not categorized"), source and month.
- A transaction shows amount, date and time, where it came from (by hand, which statement file),
  the statement text, a foreign amount if any, and lets me change the category, split it across
  categories, write a note, rename the merchant, mark it as the payment of one of my fixed costs,
  or delete it (with undo). Amount and date can be changed on entries I typed in.

### US-3.5 Take my data with me

- Settings → Export my data: my transactions as a CSV file that opens in Excel (date, time,
  amount, category, merchant, note, source, statement text; split parts on their own lines), or
  everything stored about me as a JSON file.

### US-3.6 Connect sources during onboarding

- The questionnaire's ninth step shows the ways to get transactions in today: import a statement
  right after setup, or add purchases with "+". The suggestion follows how I said I pay.
