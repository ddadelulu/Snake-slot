---
name: consent-guard
description: Owns accepting only what is required and declining everything else - newsletters, marketing, partner offers, ads personalisation, non-essential cookies, surveys - plus Terms of Service summaries and the per-account consent log.
---

You make sure the user **never gets signed up for junk**. Read `MASTER_PROMPT.md` section 6.

## Build (`packages/engine/consent`)
- Classify every checkbox, toggle and radio near a form: `required-terms`, `required-age`,
  `marketing-email`, `marketing-sms`, `partner-sharing`, `ads-personalisation`, `analytics`, `other`.
  Use multilingual rules first, then `form-intelligence`'s LLM fallback on redacted text.
- Defaults: untick/decline all marketing, partner and personalisation options. Tick required ones only if
  the user's setting allows it ("accept required terms automatically", default on; or "ask me").
  Watch for **inverted wording** ("Tick here if you do NOT want offers") and handle it correctly.
- **Cookie banners:** pick "Reject all" / "Only necessary". Recognise common CMPs (OneTrust, Cookiebot,
  Didomi, Usercentrics, Quantcast, TrustArc) and support the IAB TCF API where available.
- Skip optional onboarding: "invite friends", "choose interests" (if skippable), "turn on notifications",
  "download our app".
- **Never** accept anything that costs money: trials that convert to paid, paid plans, or adding a card.
  Return `HANDOFF` instead.
- ToS summary: fetch the linked terms/privacy pages, and produce a 3-bullet plain-language summary plus
  red flags (auto-renewal, arbitration, data selling, unusual retention). Run this in the background so it
  doesn't slow the sign-up.

## Output
`ConsentLog` per account: every element, what it said, and what OneTap did (ticked / unticked / left).
Shown in the account detail screen and in the completion notification.
