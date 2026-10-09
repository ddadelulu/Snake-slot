# Task board

Owner: **Samuel L. Jackson** (lead). Only the lead changes scope or this board. Every task has
one owner; reviewers are named where a second agent must sign. Milestones follow spec section 16
and each needs the lead's approval before the next starts.

Status: ✅ done · 🔄 in progress · ⏳ not started · ⛔ blocked (by whom)

## Kick-off decisions

- **D-001 Working title "Batzen".** Swiss for a coin, as in "e schöne Batze Gäld" (a nice bit of
  money). It lives in one file, `packages/core/src/app-identity.json`, so a rename is a one-line
  change. Julia Roberts checks the trademark before any store submission (M7).
- **D-002 Location.** The app lives in `budget-app/` inside this repository on branch
  `claude/magical-volta-pxs3wp`, fully separate from the slot game around it. It can move to its
  own repository with `git subtree split --prefix budget-app`.
- Full decision log: [DECISIONS.md](DECISIONS.md).

## Milestone 1 · Foundations ✅ (approved, see sign-off below)

Setup, auth, data model, design tokens, navigation.

| ID    | Task                                                                                      | Owner             | Review                    | Status |
| ----- | ----------------------------------------------------------------------------------------- | ----------------- | ------------------------- | ------ |
| M1-01 | Task board, order, kick-off decisions                                                     | Samuel L. Jackson | –                         | ✅     |
| M1-02 | M1 user stories with acceptance criteria                                                  | Tom Hanks         | Samuel L. Jackson         | ✅     |
| M1-03 | Stack, folder structure, data model, API contract, source plug-in contract, shared vocab  | Keanu Reeves      | Matt Damon, Tom Cruise    | ✅     |
| M1-04 | Supabase migration: 15 tables, RLS, composite tenant keys, triggers, account deletion RPC | Matt Damon        | Tom Cruise, Julia Roberts | ✅     |
| M1-05 | Money primitives: integer Rappen, parse/format without floats, budget status thresholds   | Russell Crowe     | Daniel Craig              | ✅     |
| M1-06 | Design-token file (light/dark), theme provider, 7 spec components + form primitives       | Robert Downey Jr. | Tom Hanks                 | ✅     |
| M1-07 | Navigation: auth stack, 5 bottom tabs, protected routes, deep-link callback               | Robert Downey Jr. | Samuel L. Jackson         | ✅     |
| M1-08 | Auth: email/password, Google, Apple; keychain session storage; password reset; deletion   | Matt Damon        | Tom Cruise                | ✅     |
| M1-09 | German + English catalogues, language detection, account language sync                    | Robert Downey Jr. | Tom Hanks, Morgan Freeman | ✅     |
| M1-10 | Security review of M1                                                                     | Tom Cruise        | –                         | ✅     |
| M1-11 | Privacy review of the data model (consent, deletion, residency)                           | Julia Roberts     | –                         | ✅     |
| M1-12 | Test plan; unit, database, component, route and end-to-end tests                          | Daniel Craig      | –                         | ✅     |
| M1-13 | CI (GitHub Actions), environments (dev/staging/prod), EAS build profiles                  | Vin Diesel        | Tom Cruise                | ✅     |
| M1-14 | README, setup guide, architecture, data model, API, testing, changelog                    | Morgan Freeman    | Keanu Reeves              | ✅     |
| M1-15 | Milestone approval                                                                        | Samuel L. Jackson | –                         | ✅     |

Not active in M1 (no work assigned, by design): Jim Carrey (M4), Anthony Hopkins (M2), Leonardo
DiCaprio (M6), Benedict Cumberbatch (M3, M6), Scarlett Johansson (M2 budget suggestions, M5),
Liam Neeson (M4), Brad Pitt (M7).

## Milestone 2 · Onboarding + budget engine + home screen ✅ (approved, see sign-off below)

| ID    | Task                                                                                                                                                                                                                                                | Owner                              | Review                    | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------- | ------ |
| M2-01 | M2 user stories (questionnaire, summary "Your month", home)                                                                                                                                                                                         | Tom Hanks                          | Samuel L. Jackson         | ✅     |
| M2-02 | Budget engine: spendable, per-category remaining, main balance, daily allowance, pace forecast, payday period boundaries (incl. months without the payday), rollover/savings/reset, refunds, overspend cover                                        | Russell Crowe                      | Daniel Craig              | ✅     |
| M2-03 | Onboarding flow: 8 question steps + summary (step 9 "connect sources" arrives with the first source in M3, D-024), one topic per screen, progress bar, back, skip where optional; writes profile, fixed costs, categories, first period and budgets | Anthony Hopkins                    | Tom Hanks                 | ✅     |
| M2-04 | Budget split suggestion (rules-based now, assistant later) with sliders and over-allocation warning                                                                                                                                                 | Scarlett Johansson + Russell Crowe | Tom Hanks                 | ✅     |
| M2-05 | Home screen: BalanceHeader, pace line, category cards, last 5 transactions ("+" button in M3, AI bar in M5, D-027)                                                                                                                                  | Robert Downey Jr.                  | Tom Hanks                 | ✅     |
| M2-06 | Payday period job (create next period, apply leftover policy): `roll_due_periods` hourly via pg_cron, plus on demand at app start (D-022)                                                                                                           | Matt Damon                         | Russell Crowe, Tom Cruise | ✅     |
| M2-07 | Onboarding gate in navigation (signed in but not onboarded → onboarding)                                                                                                                                                                            | Robert Downey Jr.                  | Samuel L. Jackson         | ✅     |
| M2-08 | Tests: engine 100 % coverage, onboarding E2E "sign-up to correct budget in under 5 minutes"                                                                                                                                                         | Daniel Craig                       | –                         | ✅     |
| M2-09 | Docs + help texts for onboarding                                                                                                                                                                                                                    | Morgan Freeman                     | Tom Hanks                 | ✅     |

## Milestone 3 · Manual add + CSV/camt.053 import + categorization ✅ (approved, see sign-off below)

| ID    | Task                                                                                                                                                           | Owner                                    | Review                 | Status |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------- | ------ |
| M3-00 | Contracts: `add_transactions` pipeline and transaction RPCs (API.md), categorization rules (CATEGORIZATION.md), `SourceTransaction` local dates, merchant keys | Keanu Reeves                             | Matt Damon, Tom Cruise | ✅     |
| M3-01 | Manual quick-add (under 5 seconds) from the "+" button and `batzen://add`, split, note                                                                         | Benedict Cumberbatch + Robert Downey Jr. | Tom Hanks              | ✅     |
| M3-02 | Statement import: CSV (major Swiss banks, column mapping fallback) and camt.053 XML, parsed on the phone; preview, duplicates unchecked; undo an import        | Benedict Cumberbatch                     | Daniel Craig           | ✅     |
| M3-03 | Deduplication across sources (amount + close time + merchant, keep richest data)                                                                               | Benedict Cumberbatch + Matt Damon        | Russell Crowe          | ✅     |
| M3-04 | Categorization pipeline: user rules → merchant list → MCC (AI guess in M5, D-029), confidence; fixed-cost detection (D-031)                                    | Scarlett Johansson + Matt Damon          | Benedict Cumberbatch   | ✅     |
| M3-05 | "Always do this for Manor?" rules; low-confidence questions; rules list in Settings                                                                            | Robert Downey Jr.                        | Tom Hanks              | ✅     |
| M3-06 | Transactions screen (list, search, filters, detail/edit/split/delete)                                                                                          | Robert Downey Jr.                        | Tom Hanks              | ✅     |
| M3-07 | Data export (CSV + full JSON) in Settings                                                                                                                      | Matt Damon                               | Julia Roberts          | ✅     |
| M3-08 | Onboarding step 9 "connect sources" (D-037)                                                                                                                    | Anthony Hopkins                          | Tom Hanks              | ✅     |
| M3-09 | Column-level grants for `profiles` and `budget_periods` (accepted M2 item, D-036)                                                                              | Matt Damon                               | Tom Cruise             | ✅     |
| M3-10 | Tests: parsers 100 % coverage, pipeline database tests, E2E quick-add under 5 s, import CSV + camt.053, dedupe, rule, export                                   | Daniel Craig                             | –                      | ✅     |
| M3-11 | Docs + help texts (import guide per bank, categorization)                                                                                                      | Morgan Freeman                           | Tom Hanks              | ✅     |

**Gap reported at the M3 kick-off (spec section 12, not yet in any milestone):** Category detail
(budget, spent, history chart, its transactions, edit budget), Insights, and the Settings editors
for profile & income, fixed costs, and categories & budgets. Scheduled by the lead: Category
detail and the Settings editors in **M4** (Robert Downey Jr., with the alert thresholds that use
them), Insights in **M5** (with the assistant's monthly review). Pain level and notification
settings stay in M4 (M4-02, M4-05), subscription in M7.

## Milestone 4 · Cash-feel moment + alerts ✅ (approved; device checks of push and widgets in M7)

| ID    | Task                                                                                                                                                                                                                                                                                                  | Owner                          | Review             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------ |
| M4-01 | Payment moment: odometer spin-down, wallet, bar drain, haptics, sound, hours of work, queue                                                                                                                                                                                                           | Jim Carrey                     | Tom Hanks          |
| M4-02 | Pain levels (Mild/Normal/Brutal), Reduce Motion, silent mode                                                                                                                                                                                                                                          | Jim Carrey                     | Daniel Craig       |
| M4-03 | Alert engine: thresholds, total low, pace, unusual, daily allowance, payday, dedupe                                                                                                                                                                                                                   | Liam Neeson                    | Russell Crowe      |
| M4-04 | Push delivery (Expo Notifications), quiet hours, daily cap, push token registration                                                                                                                                                                                                                   | Liam Neeson                    | Tom Cruise         |
| M4-05 | Alerts inbox and notification settings screens                                                                                                                                                                                                                                                        | Robert Downey Jr.              | Tom Hanks          |
| M4-06 | Pipeline guard: clients change transactions, splits and data sources only through the RPCs (accepted M3 security item)                                                                                                                                                                                | Matt Damon                     | Tom Cruise         |
| M4-07 | Category detail (budget, spent, history, its transactions, edit budget) and Settings editors: profile & income, fixed costs (deactivate, never delete), categories & budgets (gap from the M3 kick-off)                                                                                               | Robert Downey Jr.              | Tom Hanks          |
| M4-08 | Push version of the category question ("CHF 84 at Manor: what was it?", alert type `categorize`)                                                                                                                                                                                                      | Liam Neeson                    | Scarlett Johansson |
| M4-09 | Budget reminders (product owner request 2026-10-09): payday "plan your new month" (review budgets), weekly "log cash and import your statement", and "budget not touched for 30 days"; each with an on/off switch, day and time, respecting quiet hours and the daily cap                             | Liam Neeson                    | Tom Hanks          |
| M4-10 | Home-screen widgets for iOS (WidgetKit) and Android (App Widget), moved forward from M7 at the product owner's request (replaces D-035): balance left, per day, days to payday, a "+" that opens quick add; small and medium sizes; data shared from the app, refreshed on every change and on payday | Vin Diesel + Robert Downey Jr. | Tom Cruise         |

## Milestone 5 · AI assistant ⏳

| ID    | Task                                                                                        | Owner              | Review                    |
| ----- | ------------------------------------------------------------------------------------------- | ------------------ | ------------------------- |
| M5-01 | Assistant Edge Function with read-only tools, confirmed write tools, guardrails             | Scarlett Johansson | Tom Cruise, Julia Roberts |
| M5-02 | Chat tab, home input bar, context buttons                                                   | Robert Downey Jr.  | Tom Hanks                 |
| M5-03 | "Can I afford this?", monthly/weekly reviews (scheduled)                                    | Scarlett Johansson | Russell Crowe             |
| M5-04 | Evaluation set: never invents numbers, no investment/credit/tax advice, language            | Daniel Craig       | Scarlett Johansson        |
| M5-05 | Categorization step 4: AI guess for transactions the first three steps cannot place (D-029) | Scarlett Johansson | Benedict Cumberbatch      |
| M5-06 | Insights screen (gap from the M3 kick-off)                                                  | Robert Downey Jr.  | Tom Hanks                 |

## Milestone 6 · Data sources ⏳

| ID    | Task                                                                                      | Owner                      | Review                    |
| ----- | ----------------------------------------------------------------------------------------- | -------------------------- | ------------------------- |
| M6-01 | Bank: mock/sandbox adapter first, then bLink or licensed aggregator; read-only, reconnect | Leonardo DiCaprio          | Tom Cruise, Julia Roberts |
| M6-02 | Android notification listener (opt-in per app)                                            | Benedict Cumberbatch       | Julia Roberts             |
| M6-03 | iOS Shortcuts / App Intent + in-app setup guide                                           | Benedict Cumberbatch       | Tom Hanks                 |
| M6-04 | Email receipts (Gmail/Outlook read-only)                                                  | Benedict Cumberbatch       | Julia Roberts, Tom Cruise |
| M6-05 | Receipt photo OCR + AI item split                                                         | Benedict Cumberbatch       | Scarlett Johansson        |
| M6-06 | Per-source consent screens, revoke, token encryption (private schema)                     | Julia Roberts + Matt Damon | Tom Cruise                |

## Milestone 7 · Subscription, security review, QA, release builds ⏳

| ID    | Task                                                                                    | Owner         | Review          |
| ----- | --------------------------------------------------------------------------------------- | ------------- | --------------- |
| M7-01 | RevenueCat: CHF 5/month, 14-day trial, paywall, restore, manage, expired read-only mode | Brad Pitt     | Tom Hanks       |
| M7-02 | Store webhook → subscriptions table (service role)                                      | Matt Damon    | Tom Cruise      |
| M7-03 | Release security review (pen-test checklist, dependency audit, secrets scan)            | Tom Cruise    | –               |
| M7-04 | Privacy policy, store privacy labels, data processing agreements                        | Julia Roberts | external lawyer |
| M7-05 | Full regression, native E2E (Maestro) on iOS + Android                                  | Daniel Craig  | –               |
| M7-06 | Release builds, crash reporting, monitoring, store submission                           | Vin Diesel    | Tom Cruise      |

## Needs a human (outside what the agents can do)

| Item                                                                                  | Why                                                             | Needed by |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| Hosted Supabase projects (staging, production) in an EU or Swiss region               | Spec 15: hosting in Switzerland or the EU; needs your account   | M2        |
| Google Cloud OAuth client and Apple Developer "Sign in with Apple" (Services ID, key) | Real provider credentials; never generated by agents            | M2        |
| bLink (SIX) participation or a licensed aggregator contract                           | Licensing and contracts; Julia flags: lawyer + licensed partner | M6        |
| LLM provider account with a no-training data agreement                                | Spec 15: the AI provider must not train on user data            | M5        |
| Apple App Store / Google Play developer accounts, RevenueCat project                  | Store billing                                                   | M7        |
| EAS project id and Apple team id (`EAS_PROJECT_ID`, `APPLE_TEAM_ID`, docs/RELEASE.md) | Push tokens and signing the widget extension; account-bound     | M4        |
| Legal review of privacy policy and terms (revDSG + GDPR)                              | Julia: needs a lawyer                                           | M7        |
| Trademark check for the final app name                                                | Julia                                                           | M7        |

## M4 sign-off

- **Daniel Craig (QA):** all suites green (core 572, app 1124, database 1139, end-to-end 20);
  device checks for push and widgets listed in WIDGETS.md.
- **Tom Cruise (security):** direct client writes to transactions, splits and data sources now
  refused (guard); push tokens only through RPCs; `claim_pushes` service-role only.
- **Samuel L. Jackson:** Milestone 4 approved. Milestone 5 (AI assistant) needs the LLM provider
  agreement (needs a human) and starts on the product owner's go.

## M3 sign-off

- **Daniel Craig (QA):** signed off after the adversarial review and its fixes; core 572 tests
  (100 %), app 1016, database 999, end-to-end 20 ([TESTING.md](TESTING.md#milestone-3-results)).
- **Tom Cruise (security):** no cross-tenant or escalation findings; the medium and low findings
  are fixed; direct own-row writes accepted until M4-06 ([SECURITY.md](SECURITY.md)).
- **Julia Roberts (privacy):** files stay on the phone, third-party texts handled and removable,
  export complete ([PRIVACY.md](PRIVACY.md#milestone-3-review)).
- **Tom Hanks (product):** quick add, import, questions and rules reviewed in English and German.
- **Samuel L. Jackson:** Milestone 3 approved. Milestone 4 may start on the product owner's go.

## M2 sign-off

- **Daniel Craig (QA):** signed off. Engine 229 tests at 100 % coverage (enforced), app 706 tests,
  database 510 tests, end-to-end 15 tests incl. sign-up → full questionnaire → correct Home and
  booked transactions updating every number ([TESTING.md](TESTING.md#milestone-2-results)).
- **Tom Cruise (security):** M2 review passed; one accepted item for M3 (column-level grants),
  [SECURITY.md](SECURITY.md#milestone-2-review-2026-10-02).
- **Julia Roberts (privacy):** new fields are purpose-bound; nothing new leaves Supabase;
  [PRIVACY.md](PRIVACY.md).
- **Tom Hanks (product):** questionnaire and Home reviewed in English and German, light and dark.
- **Samuel L. Jackson:** Milestone 2 approved. Milestone 3 may start on the product owner's go.

## M1 sign-off

- **Daniel Craig (QA):** signed off. Unit, database, component, route and end-to-end suites are
  green; results in [TESTING.md](TESTING.md#milestone-1-results).
- **Tom Cruise (security):** M1 review passed with no open findings;
  [SECURITY.md](SECURITY.md).
- **Julia Roberts (privacy):** data model approved; open legal items listed above;
  [PRIVACY.md](PRIVACY.md).
- **Samuel L. Jackson:** Milestone 1 approved. Milestone 2 may start on the product owner's go.
