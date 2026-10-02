# Changelog

## 0.2.0 · Milestone 2: Onboarding, budget engine, home screen (2026-10-02)

### Added

- Onboarding questionnaire: income and payday, fixed costs, saving (incl. what happens to leftover
  money), categories (defaults and custom), budgets with sliders and a suggested split, how you
  pay, pain level, warnings, and the "Your month" summary. Progress bar, back and skip; answers
  kept on the device until saved; saved atomically.
- Budget engine in `@budget/core`: payday periods (short months), spendable, allocation check,
  suggestion in CHF 5 steps, balance, daily allowance, statuses, pace forecast, leftover rules,
  hours of work, overspend cover. 100 % test coverage, enforced.
- Database: spending totals per period, `get_overview`, `complete_onboarding`, `move_budget`, and
  the monthly reset on payday (hourly job plus on demand), with time-zone validation.
- Home: balance like a bank balance, per-day amount, days until payday, pace line, carried-over
  money, category cards, latest purchases.
- New components: StepProgress, DayGrid, ToggleChip/ChipGroup, SwitchRow, Stepper, AmountSlider.

## 0.1.0 · Milestone 1: Foundations (2026-10-01)

### Added

- Monorepo (`budget-app/`): shared contracts (`@budget/core`), Supabase project (`@budget/db`),
  Expo app (`@budget/mobile`).
- Data model for every table in spec section 14, with row-level security, least-privilege grants,
  tenant-safe composite foreign keys, server timestamps, split-transaction rules and full account
  deletion.
- Money primitives in integer Rappen: parsing (Swiss formats such as `1’240.50` and `12.–`),
  formatting per language, exact sums and division, budget status thresholds (80 % / 100 %).
- Transaction source plug-in contract and validator.
- Design-token file with light and dark themes (WCAG AA contrast verified) and the reusable
  components BalanceHeader, CategoryCard, TransactionRow, ProgressBar, AlertBanner, PrimaryButton
  and BottomSheet, plus form and layout primitives.
- Accounts: sign-up, sign-in, sign-out, password reset, Google and Apple sign-in, deletion.
  Sessions stored in the keychain/keystore.
- Navigation: sign-in screens, five bottom tabs, password-reset hold, deep-link callback.
- German and English, with account language sync; light, dark or system appearance.
- Tests: core, app (components, auth, i18n, routes), database (RLS and integrity) and end-to-end.
- CI for format, lint, typecheck, unit, database and end-to-end tests; EAS build profiles.
- Documentation: task board, user stories, architecture, data model, API, setup, testing,
  security, privacy, release, decisions.
