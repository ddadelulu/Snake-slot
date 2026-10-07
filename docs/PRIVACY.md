# Privacy and compliance

Owner: **Julia Roberts**. Swiss data protection law (revDSG/nDSG) and the GDPR. This is the
engineering view; anything marked "lawyer" needs qualified legal advice before release.

## Data inventory (Milestone 1 schema)

| Data                                          | Why                                      | Where                                |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------ |
| Email, password hash, OAuth identity          | Account                                  | `auth.users` (Supabase Auth)         |
| Income, payday, work hours, savings, settings | Budget and "hours of work"               | `profiles`                           |
| Fixed costs, categories, budgets, periods     | Budgeting                                | own tables                           |
| Transactions (amount, merchant, text, items)  | Tracking spending (from M3)              | `transactions`, `transaction_splits` |
| Connected sources and their consent           | Automatic tracking (from M6)             | `data_sources`                       |
| Encrypted source tokens                       | Read-only access to bank/email (from M6) | `private.data_source_credentials`    |
| Alerts, notification settings                 | Warnings (from M4)                       | `alerts`, `notification_settings`    |
| Assistant conversations                       | AI help (from M5)                        | `ai_conversations`, `ai_messages`    |
| Subscription status                           | Billing (from M7)                        | `subscriptions`                      |
| Consent records                               | Proof of consent                         | `consent_events`                     |

Financial data is sensitive; it is processed only to provide the budget to the person themselves.
No selling, no sharing, no advertising use, no profiling for third parties (spec section 15).

## Principles in the design

- **Purpose and minimisation.** Only what a feature needs; bank login credentials are never
  stored, only encrypted tokens (spec 15). Receipt photos are not stored until M6 decides it is
  necessary (storage is disabled).
- **Consent per data source.** Each `data_sources` row carries the consent version and time; a
  revoked source must have a revocation time. `consent_events` keeps an append-only history
  (server timestamps) for terms, privacy policy, each source, AI processing and email access.
- **Erasure.** Settings → Delete account removes the account and every row (verified by test).
  M6 adds revoking provider tokens at the provider; M7 tells subscribers to cancel in the store.
- **Access and portability.** Settings → Export my data: transactions as CSV, and everything
  stored about the person (including the account's email address) as JSON (D-034).
- **Isolation.** Row-level security per user (see SECURITY.md).

## Hosting

Supabase project region: Zurich (`eu-central-2`) where the plan offers it, otherwise Frankfurt
(`eu-central-1`); both satisfy "hosting in Switzerland or the EU". Supabase acts as processor: a
data processing agreement is needed (lawyer to review). Sub-processors (e.g. the cloud provider,
email delivery) must be listed in the privacy policy.

## Open items needing a lawyer or licensed partner

| Item                                                                                                 | Milestone |
| ---------------------------------------------------------------------------------------------------- | --------- |
| Privacy policy and terms in German and English (revDSG Art. 19 information duties, GDPR Art. 13)     | M7        |
| Data processing agreements: Supabase, LLM provider (must not train on user data), email/OCR services | M5–M7     |
| Bank access via bLink (SIX) or a licensed aggregator: contracts, licensing, liability                | M6        |
| Reading Gmail/Outlook: Google restricted-scope verification and security assessment                  | M6        |
| Android notification listener: Google Play policy declaration for financial data                     | M6        |
| Retention periods (e.g. how long transactions and consent records are kept after inactivity)         | M7        |
| Trademark check of the final app name                                                                | M7        |

## Milestone 3 review

- **Statement files** are read on the phone; the file itself is never uploaded. Its transactions
  are checked against the account for the preview without being stored (dry run), and only the
  ones the person keeps are stored. The picked file's copy is deleted after reading.
- **Third-party data.** Statement texts can contain names and IBANs of the people and companies
  the person paid or was paid by. They are stored exactly as the bank printed them, only in the
  person's own rows, used only to show and sort the person's transactions, and removed with the
  import (Settings → Data sources → Remove deletes the file's transactions for good and undoes
  what it added to other transactions, D-041) or with the account.
- **Categorization** runs in the database on the person's own data plus a public list of
  merchant names; nothing is sent to third parties (the AI step waits for M5 and its provider
  agreement).
- **Export.** The CSV and JSON exports contain personal financial data; the app says so before
  sharing and removes the temporary file from the phone after the share sheet closes.
- **Retention.** Transactions deleted by the person are kept (restorable) until the account is
  deleted; the retention period is part of the open M7 item above.

— Julia Roberts, 2026-10-07

## Milestone 2 review

New personal data: hours worked per week (for "= X hours of work"), savings goal, payment methods
(to suggest tracking sources), warning preferences and the device time zone (for the start of each
month). All stay in the user's own rows, are deleted with the account and are used only for the
stated purpose. Onboarding answers are kept on the device until saved and removed afterwards.
Nothing new is sent to third parties. — Julia Roberts, 2026-10-02

## Milestone 1 review

Data model approved: deletion is complete, consent can be proven, credentials have a server-only
home, and nothing is collected yet that a feature does not need. — Julia Roberts, 2026-10-01
