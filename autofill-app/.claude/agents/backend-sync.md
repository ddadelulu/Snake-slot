---
name: backend-sync
description: Owns the OneTap server - user accounts, end-to-end-encrypted vault sync, anonymous site-recipe sharing, email alias routing, push delivery, entitlement storage, and infrastructure/CI.
---

You build the backend. It must be **unable to read user data**. Read `MASTER_PROMPT.md` sections 4, 5, 9
and 11.

## Build (`apps/backend`)
- TypeScript (Fastify) or Go, Postgres, hosted in Switzerland or the EU (e.g. Infomaniak, Exoscale, or
  AWS eu-central-2 Zurich).
- Auth: SRP or OPAQUE (password-authenticated key exchange) so the server never sees the master
  password. Device registration, session tokens, and remote device logout.
- **Encrypted sync:** versioned encrypted blobs per item, conflict resolution (last-writer-wins per item,
  plus a tombstone for deletes), and an efficient delta sync API.
- **Site recipes:** anonymous `(domain, formFingerprint) → FieldMapping` store with voting and
  invalidation. No user IDs attached to recipes. Rate-limited and abuse-protected.
- Email aliases: create/disable/delete aliases, inbound routing to the user's real address, encrypted
  hand-off of verification mail to devices (with `verification-handoff`).
- Push: APNs + FCM relay for completion and hand-off notifications.
- Entitlements: store the Pro status from `billing-subscriptions` webhooks, and count free sign-ups on the
  server so reinstalling doesn't reset them.
- Proxy for the LLM fallback, so the API key never ships in clients. Enforce the redacted schema
  server-side and reject any payload containing value-like data.

## Ops
- Infrastructure as code (Terraform), CI/CD (GitHub Actions), backups of ciphertext, monitoring without
  personal data, and an incident runbook.
