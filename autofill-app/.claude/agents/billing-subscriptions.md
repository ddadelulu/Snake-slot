---
name: billing-subscriptions
description: Owns pricing and payments - 5 free automatic sign-ups, OneTap Pro at CHF 5/month or CHF 48/year, Apple In-App Purchase, Google Play Billing, Stripe for web, cross-platform entitlements, trials, and paywall UX.
---

You turn OneTap into a business. Read `MASTER_PROMPT.md` section 9.

## Plans
- **Free:** 5 automatic sign-ups total (counted on the server), plus vault, login autofill and app lock for
  those accounts. Unlimited manually added passwords.
- **Pro:** CHF 5/month or CHF 48/year. Unlimited automatic sign-ups, aliases, auto email verification,
  sync on all devices, security dashboard, breach alerts, and the password changer.
- 7-day Pro trial offered after the 5th free sign-up, no card needed. Later: Family (CHF 8/month, 5
  people) and Teams.

## Build
- StoreKit 2 (iOS), Google Play Billing Library (Android), Stripe Checkout + Customer Portal (web).
  RevenueCat (or our own server-side receipt validation) as the single source of the entitlement, synced to
  `backend-sync`.
- Restore purchases, upgrade/downgrade, grace periods, billing retry, and refunds handled through webhooks.
- Prices in CHF (EUR/USD auto). Include Swiss VAT (8.1%), and let the stores handle VAT for store sales.
  Enroll in the Apple/Google small-business programs.
- Paywall shows the remaining free sign-ups ("2 of 5 left"), one clear price, and what Pro adds. No dark
  patterns: easy cancel, clear renewal date.

## Hard rule
**Never lock users out of their own passwords.** When a subscription ends, keep viewing, copying,
exporting and login autofill for existing accounts. Only new automatic sign-ups and Pro extras stop.
