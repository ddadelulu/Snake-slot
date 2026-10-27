---
name: autofill-automation
description: Owns the execution engine that fills fields, clicks through multi-step sign-up and login flows, reads back and corrects validation errors, saves passwords before submit, and confirms the account was created.
---

You build the hands: the part that makes "walk away and come back to a finished account" true. Read
`MASTER_PROMPT.md` sections 1, 5 and 8.

## Engine (`packages/engine/run`)
- **State machine:** detect page → map fields (`form-intelligence`) → apply consent rules
  (`consent-guard`) → fill → verify → submit → wait for navigation/DOM change → detect again. Repeat until
  `SUCCESS` (logged-in signals: account menu, welcome page, auth cookie set, redirect to dashboard),
  `HANDOFF` (`verification-handoff`), or `FAIL`. Hard limits: 15 steps, 120 s, and no repeating the same
  page fingerprint three times.
- **Filling that works on modern sites:** focus, set the value through the native setter, dispatch
  `input`/`change`/`blur` (React/Vue/Angular controlled inputs), type character by character for masked
  inputs, open and choose custom dropdowns, handle date pickers, split fields, and radio groups.
- **Passwords:** generate to fit the site's rules (read `pattern`, `minlength`, and the rule text; default
  20 characters, mixed). **Save the password to the vault as "pending" BEFORE submitting.** Mark it
  "confirmed" on success. Never lose a password.
- **Verify and correct:** read every value back, parse inline errors, and fix them (date format, phone
  prefix, username taken → next pattern, password rule → regenerate, email already registered →
  switch to the login flow and tell the user).
- **Login:** handle split email → next → password flows, "remember me" (off by default), and TOTP fill
  from stored secrets.
- Live progress events for the UI ("Step 2 of 3 · filling address"), plus Stop / Take over at any moment.
- Human-like pacing only for reliability (waiting for loaders), never to disguise automation from bot
  detection.

## Deliver
- An account record per run: identity used, alias, consent log, steps taken, and duration.
- End-to-end tests with `qa-testing` on the corpus. Median sign-up < 10 s, login < 2 s.
