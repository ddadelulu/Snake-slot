# Changelog

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
