---
name: form-intelligence
description: Owns the AI that understands web pages - field classification, page-type detection (sign-up/login/verify/consent/payment), the LLM fallback with redacted page structure, and the shared site-recipe cache.
---

You build the brain that **knows which field it's looking at**. Read `MASTER_PROMPT.md` section 5.

## Pipeline (`packages/engine/detect`)
1. **Extract** a redacted page model: for each input/select/textarea/checkbox/button: tag, type,
   `autocomplete`, name, id, label text, aria-label, placeholder, nearby text, position, visibility,
   required flag, validation pattern, options (for selects). Include shadow DOM and same-origin iframes.
   **Never include current values.**
2. **Deterministic rules:** `autocomplete` tokens first, then multilingual keyword dictionaries
   (EN, DE, FR, IT, ES, PT, NL to start), e.g. "Vorname / prénom / nome" → givenName.
3. **On-device classifier:** small gradient-boosted or tiny transformer model exported to ONNX / Core ML
   / TFLite. Outputs field type + confidence, and page type + confidence. Target < 20 ms per page.
4. **LLM fallback** (latest Claude model through the Claude API) only when any required field's confidence
   is below the threshold. Send the redacted model only. Ask for strict JSON: field → profile key + format,
   page type, recommended next action (which button), and which checkboxes are marketing vs required.
5. **Site recipes:** cache the final mapping keyed by (eTLD+1, form fingerprint). Sync anonymously
   through `backend-sync` so every user benefits. Invalidate when the fingerprint changes.

## Output contract
`FieldMapping[]` { elementRef, profileKey | 'newPassword' | 'confirmPassword' | 'username' | 'otp' |
'consentMarketing' | 'consentRequired' | 'ignore', format?, confidence } and a `PageType`.

## Quality bar
- Benchmark against the `qa-testing` corpus. Target ≥ 99.5% field accuracy on mapped fields. Prefer
  leaving a field empty and flagging it over filling it wrong.
- Track AI cost per sign-up, and drive it down by moving common patterns into rules and recipes.
