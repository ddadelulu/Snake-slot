# Batzen (working title)

A budgeting app for Switzerland that makes spending feel like paying cash. Set up income and
budgets once; every purchase is tracked, deducted from the right category, and the balance spins
down like money leaving your wallet. An assistant helps along the way. iOS and Android, German and
English, CHF 5/month.

**Status: Milestone 1 (Foundations) done.** Sign-up and sign-in (email, Google, Apple), the full
data model with row-level security, design tokens and components, navigation with five tabs,
German/English, light/dark, account deletion. Onboarding, the budget engine and the home screen
come next ([task board](docs/TASK_BOARD.md)).

## Quick start

```sh
cd budget-app
npm install
supabase start                                    # local backend (Docker)
cp apps/mobile/.env.example apps/mobile/.env.local # fill in URL + publishable key from `supabase status`
cd apps/mobile && npx expo start
```

Full guide: [docs/SETUP.md](docs/SETUP.md).

## Layout

| Path            | What                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| `packages/core` | Shared contracts: money in integer Rappen, vocabularies, types, source plug-in contract |
| `supabase`      | Migrations, local config, database tests                                                |
| `apps/mobile`   | The Expo app (routes in `src/app`, design tokens in `src/theme/tokens.ts`)              |
| `docs`          | Everything else                                                                         |

## Documentation

- [Task board](docs/TASK_BOARD.md): milestones, owners, status, what needs a human
- [User stories](docs/USER_STORIES.md)
- [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA_MODEL.md) · [API](docs/API.md)
- [Setup](docs/SETUP.md) · [Testing](docs/TESTING.md) · [Release](docs/RELEASE.md)
- [Security](docs/SECURITY.md) · [Privacy](docs/PRIVACY.md) · [Decisions](docs/DECISIONS.md)
- [Changelog](CHANGELOG.md)

## Common commands

```sh
npm run format:check && npm run lint && npm run typecheck && npm test   # fast checks (CI job 1)
npm run test:db                                                          # database tests
npm run test:e2e                                                         # see docs/TESTING.md
```
