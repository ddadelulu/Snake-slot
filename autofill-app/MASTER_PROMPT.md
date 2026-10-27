# Master Prompt: "OneTap" (working title), the AI that signs you up while you walk away

> Paste everything below the line into Claude Code (or any coding agent) at the root of a **new, empty
> repository**. Copy the `.claude/agents/` folder from this directory into that repo first, so the
> specialist agents named below exist.

---

## 1. What we are building

Build **OneTap**, a cross-platform app plus browser extension that **creates accounts and logs in for the
user, start to finish, with one tap**. The user enters their details once. From then on, when they land on
any sign-up or login page, they tap one button (or it starts on its own if they allow that) and the app:

1. Detects that the page is a sign-up, login, or multi-step onboarding flow.
2. Identifies every field (first name, last name, email, phone, date of birth, address, username,
   password, confirm password, gender, country, postcode, company, and so on), including fields with bad
   or missing labels, fields split over several inputs (DOB as day/month/year, phone as prefix plus
   number), custom dropdowns, date pickers, radio groups, and checkboxes.
3. Fills each field with the right value from the user's profile, formatted the way that field wants it.
4. Generates a strong unique password, fills it in, and **saves it to the vault before submitting**, so a
   crash mid-flow never loses a password.
5. **Declines everything optional and useless**: newsletters, "partner offers", marketing emails/SMS,
   personalised ads, non-essential cookies, "share my data". It only accepts what is required to create
   the account (Terms of Service, Privacy Policy), and only within the rules the user set (section 6).
6. Clicks "Next"/"Continue"/"Create account" and **keeps going through every step** until the account
   exists: multi-page wizards, "tell us about yourself" screens, onboarding surveys (skips them when it
   can), email verification, and the first login.
7. Notifies the user when it is done ("Account created on example.com, password saved") or when it needs
   them (CAPTCHA, SMS code it can't read, ID check, payment).

The target experience: **a sign-up takes 2–10 seconds instead of 2–5 minutes, and the user can walk away
and come back to a finished account.** It must be more accurate than Apple's AutoFill. Apple fills one
page and leaves mistakes for the user to fix. OneTap fills, checks, corrects, and finishes the whole flow.

Login is the same experience: one tap (or none) on any login page fills the saved credentials, handles
"enter email → next → enter password" split flows, fills TOTP 2FA codes it stores, and submits.

## 2. Platforms (in build order)

| Platform | How OneTap gets into the page | Notes |
|---|---|---|
| **Desktop browser extension** (Chrome, Edge, Brave, Firefox, Safari), Manifest V3 | Content script reads and drives the DOM | Easiest place for the full "walk away" flow. **Build this first.** |
| **iOS app + Safari Web Extension** | Safari Web Extension for full sign-up automation; **AutoFill Credential Provider extension** (`ASCredentialProviderViewController`) for one-tap login in Safari and every other app | iOS doesn't let a third-party app drive other apps' screens. Full sign-up automation only works in Safari (via the extension) and in OneTap's own built-in browser. |
| **Android app** | `AutofillService` + Credential Manager for login everywhere; built-in browser (WebView) for full sign-up automation | Don't use the Accessibility API to drive other apps. Google Play restricts it and it's a security risk. |
| **macOS / Windows desktop app** (later) | Vault UI + native messaging to the extension | Optional. The extension plus a web vault may be enough. |

The iOS/Android apps hold the vault, the profile, settings, billing, and the lock screen. Every client
syncs through an end-to-end-encrypted backend.

## 3. Onboarding: "Put your details in once"

- A friendly step-by-step form that collects the **profile**: legal first/middle/last name, preferred
  name, email(s), phone (with country code), date of birth, gender (optional, with "prefer not to say"),
  address(es) (home/work, structured: street, number, postcode, city, region, country), company/job title
  (optional), preferred username pattern, language, and timezone.
- Let users add **several identities** (Personal, Work, Burner) and pick a default.
- Offer **email aliases** (like Apple's Hide My Email) so each sign-up can get its own forwarding address
  and verification emails can be read automatically (see section 7).
- Import passwords from Apple Passwords/iCloud Keychain export, Chrome, 1Password, Bitwarden, LastPass
  (CSV/JSON).
- Every field is optional except name and email. Explain in one line why each one is asked for.

## 4. Security (non-negotiable)

- **Zero-knowledge, end-to-end encryption.** The vault and profile are encrypted on the device with a key
  derived from the user's master secret (Argon2id → AES-256-GCM or XChaCha20-Poly1305). The server only
  ever stores ciphertext. Losing the master secret means losing the data, so offer a printable
  **Recovery Kit**.
- **App lock every time the app opens:** Face ID / Touch ID / Android BiometricPrompt, with a 6-digit
  PIN or the master password as fallback. Also lock after X minutes in the background (default 1 min),
  hide content in the app switcher, and require biometrics again before revealing or copying a password.
  Keys live in the Secure Enclave / Android Keystore, bound to biometrics.
- **Personal data never goes to an AI model.** When an LLM is used to understand a page, send it only
  the page's structure (labels, input types, surrounding text). Never send the user's values. The model
  returns a mapping like `field #3 → profile.dateOfBirth (format DD.MM.YYYY)` and filling happens
  locally.
- **Phishing protection:** only fill credentials on the exact registered domain (eTLD+1 match, respect
  the Public Suffix List). Warn on look-alike domains. Never fill into hidden or off-screen fields.
  Never fill inside cross-origin iframes unless the user allows that origin.
- **Passkeys:** support creating and storing passkeys (WebAuthn) and prefer them over passwords whenever
  a site offers them.
- Get an independent security audit and run a bug bounty before public launch.

## 5. The AI form engine (the heart of the product)

Make it layered so it's fast, cheap and accurate:

1. **Deterministic layer (instant):** HTML `autocomplete` attributes, `type`, `name`/`id`, `<label>`,
   `aria-label`, placeholder, and nearby text. Use multilingual keyword dictionaries (EN, DE, FR, IT, ES at
   minimum, since we launch in Switzerland).
2. **On-device classifier (milliseconds):** a small model (e.g. ONNX / Core ML / TFLite) trained on
   field features to classify ambiguous fields and detect page type (sign-up / login / verify / onboarding
   / consent / payment).
3. **LLM fallback (only when confidence is low):** send the redacted page structure and get back a
   field mapping plus the next action ("click button 'Weiter'"). Cache the result per site and form
   version so the next user on that site gets it instantly. Share these **site recipes** (no personal
   data) across users.
4. **Verify after filling:** read every value back, check the site's validation messages, fix errors
   (wrong date format, phone missing its country code, username taken → try the next pattern, password
   rule not met → regenerate to fit the site's rules), and only then continue.
5. **Step loop:** after each submit, re-detect the page and repeat until success is confirmed (logged-in
   state, "welcome" page, account menu visible) or a hand-off is needed. Hard limits: max steps, max
   time, never loop on the same page.

Handle: React/Vue controlled inputs (dispatch real input events, not just `.value =`), shadow DOM,
custom selects, masked inputs, single-page-app route changes, slow loaders, and cookie banners that
block the form (reject non-essential cookies).

## 6. Consent rules: accept the necessary, decline the rest

- Default: **decline** newsletters, marketing email/SMS/push, partner offers, personalised ads,
  "improve our product" data sharing, and non-essential cookies. Skip optional surveys and "invite
  friends".
- **Required** checkboxes (Terms, Privacy Policy, age confirmation): the user sets this once in Settings.
  "Accept required terms automatically" (default ON, with a clear explanation at onboarding) or "Ask me
  each time". On every account the app saves a **plain-language summary** of what was accepted and
  anything unusual in the terms (auto-renewing paid plan, arbitration clause, data selling), and shows it
  in the notification.
- Never accept anything that **costs money**: free trials that convert, paid plans, or adding a card.
  Always stop and ask.
- Keep a per-account log of every checkbox OneTap ticked or unticked.

## 7. Hand-offs: things the AI must NOT do itself

"Walk away" works for most sites, but some steps are deliberately built to need a human. OneTap must
**pause and notify** (push notification: "example.com needs you, 1 tap"), never try to get around them:

- **CAPTCHAs / "are you human" checks.** Don't solve or bypass them, and don't use CAPTCHA-solving
  services. Hand off to the user with a one-tap jump straight to the challenge, then resume automatically.
- **SMS codes:** on iOS, the system's own one-time-code AutoFill can fill them when the user is present.
  On Android, use the SMS Retriever / User Consent API. Otherwise ask the user.
- **Email verification:** automate it **only** with the user's permission, through OneTap email aliases
  (we receive the mail) or read-only access to the user's inbox (Gmail/Outlook OAuth, limited to the
  verification email from that site). Open the verification link inside the same session.
- ID/KYC checks, payment details, and anything legally binding beyond standard ToS: always the user.

Record which sites need hand-offs, so the app can tell the user beforehand ("this one will need you
once, for a CAPTCHA").

## 8. Password vault (organised automatically)

- Every account created or logged into is saved with: site name + icon, URL(s), username/email,
  password, TOTP secret (if set up), passkey, the identity used, the alias used, creation date, consent
  log, and notes.
- **Auto-organise** into categories (Social, Shopping, Banking & Finance, Streaming, Work, Gaming,
  Travel, Government, Health, Other) with search, favourites, and tags.
- **Security dashboard:** reused, weak or old passwords, and breached passwords (check against Have I
  Been Pwned with k-anonymity range queries). One-tap "change password" uses the same automation engine.
- Export everything at any time (encrypted JSON and CSV). **Users can always see and export their
  passwords, even after the free plan ends.** Never hold their passwords hostage.

## 9. Pricing

- **Free:** up to **5 automatic sign-ups**, with the vault, autofill login and app lock for those
  accounts. Users can store and view unlimited manually added passwords.
- **OneTap Pro: CHF 5 / month** (offer CHF 48 / year too): unlimited automatic sign-ups, unlimited
  autofill login, email aliases, automatic email verification, sync across all devices, security
  dashboard, breach alerts, password changer, and priority support.
- **7-day Pro trial** after the 5th free sign-up, no card needed.
- Bill through **Apple In-App Purchase** on iOS and **Google Play Billing** on Android (required for
  digital subscriptions there), and Stripe on the web. One entitlement shared across platforms
  (RevenueCat or our own receipt validation). Show prices in CHF and EUR, include Swiss VAT (8.1%), and
  join Apple's and Google's small-business programs (15% fee instead of 30%).

## 10. UX principles

- **One button.** On a sign-up page a small OneTap badge appears: "Create account with OneTap". One
  tap does everything. On login pages: "Log in", one tap. Optional "auto-run on sign-up pages" setting.
- A progress pill shows what's happening ("Step 2 of 3 · filling address · declining newsletter") with
  **Stop** and **Take over** buttons always visible.
- Must work for non-technical users and grandparents: large type, no jargon, full accessibility
  (VoiceOver/TalkBack, Dynamic Type, contrast), and localisation in EN/DE/FR/IT first.
- Default to the safest option. Every automatic action can be undone or reviewed in the account's log.

## 11. Tech stack (suggested, change it if there's a good reason)

- **Extension:** TypeScript, Manifest V3, WXT or Plasmo, shared `@onetap/engine` package.
- **Mobile:** native Swift/SwiftUI on iOS (credential provider and Secure Enclave work much better
  native) and Kotlin/Jetpack Compose on Android. Share the engine as a JS bundle running in the built-in
  WebView browser.
- **Backend:** TypeScript (Node/Fastify) or Go. Postgres for accounts, entitlements and site recipes
  (never plaintext vault data). Encrypted blob sync. Hosted in Switzerland or the EU.
- **Crypto:** libsodium / platform CryptoKit, Argon2id, and a documented key hierarchy.
- **AI:** on-device classifier + Claude API (latest Claude model) for the redacted-structure fallback.
- **Monorepo:** pnpm + Turborepo, with CI running lint, type checks, unit tests and an end-to-end form
  test suite.

## 12. Definition of done for v1

- On a test corpus of **200 real sign-up flows** in at least 5 languages, OneTap completes ≥ 90% with no
  human input (excluding flows that need a CAPTCHA or SMS hand-off) and has **0 wrong-field fills** in
  the final submitted data.
- Median sign-up time under 10 s and median login under 2 s.
- App lock, zero-knowledge encryption and phishing protection pass the security agent's checklist and an
  external audit.
- Free and Pro limits enforced correctly on iOS, Android and web, with restore purchases working.
- Privacy policy, terms and App Store / Play listings approved.

## 13. How to work: use the specialist agents

Run **`product-lead`** first. It owns the plan and hands work to the specialists in
`.claude/agents/`:

| Agent | Owns |
|---|---|
| `product-lead` | Roadmap, architecture decisions, splitting work, integration, definition of done |
| `security-vault` | Encryption, key management, app lock / Face ID, phishing protection, audit prep |
| `profile-onboarding` | Profile data model, identities, onboarding flow, password import |
| `form-intelligence` | Field detection, page classification, LLM fallback, site recipes |
| `autofill-automation` | Filling engine, multi-step navigation loop, verification, error correction |
| `consent-guard` | Declining marketing/cookies, required-terms policy, ToS summaries, consent log |
| `verification-handoff` | Email aliases, inbox verification, SMS codes, CAPTCHA/human hand-off |
| `browser-extension` | MV3 extension for Chrome/Edge/Firefox/Safari, in-page UI |
| `mobile-apps` | iOS + Android apps, credential providers, built-in browser, notifications |
| `backend-sync` | API, encrypted sync, accounts, recipe sharing, infrastructure |
| `billing-subscriptions` | Free tier limits, CHF 5 Pro, IAP / Play Billing / Stripe, entitlements |
| `ux-design` | One-tap UX, design system, accessibility, localisation |
| `qa-testing` | Form test corpus, end-to-end tests, accuracy metrics, regression suite |
| `legal-compliance` | Swiss nFADP / GDPR, ToS of target sites, store policies, privacy policy |

Start by having `product-lead` write `docs/PLAN.md` (milestones, owners, interfaces between packages).
Then build Milestone 1: **the desktop extension plus engine, signing up end-to-end on 20 test sites with
a local-only encrypted vault.**
