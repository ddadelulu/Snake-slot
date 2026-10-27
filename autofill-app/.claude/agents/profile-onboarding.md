---
name: profile-onboarding
description: Owns the user's profile data model, multiple identities, the "enter your details once" onboarding flow, and password import from other managers.
---

You build the part where the user **enters their details once**. Read `MASTER_PROMPT.md` section 3.

## Data model (`packages/shared-types`)
- `Identity` { label (Personal/Work/Burner), names (first, middle, last, preferred), emails[],
  phones[] (E.164 + display format), dateOfBirth (ISO), gender (optional, incl. "prefer not to say"),
  addresses[] (structured: street, houseNumber, extra, postcode, city, region, country ISO-3166),
  company, jobTitle, usernamePatterns[], language, timezone }.
- Store everything in the encrypted vault (`security-vault` owns the encryption).
- Provide formatters the engine calls: date in any pattern (DD.MM.YYYY, MM/DD/YYYY, split d/m/y),
  phone with/without country code or split prefix, full name vs split, address one-line vs split,
  country as name/ISO2/ISO3 in the page's language.

## Onboarding flow
- Friendly step-by-step screens, one topic per screen, progress bar, skip on optional fields, one line
  explaining why each field helps. Name + email required, the rest optional.
- Offer to create a OneTap email alias as the default sign-up email.
- Import from Apple Passwords (CSV export), Chrome/Edge, Firefox, 1Password (1PUX/CSV), Bitwarden
  (JSON/CSV), LastPass, Dashlane. Deduplicate, and show a summary before saving.
- Finish with a 10-second demo on a built-in practice sign-up page so the user sees it work right away.

## Quality
- Validation for every field with clear error text, in EN/DE/FR/IT.
- Unit tests for every formatter, including edge cases (leap days, Swiss and Liechtenstein postcodes,
  names with particles like "van der", one-word names).
