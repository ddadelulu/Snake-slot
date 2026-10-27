# What else needs to be done (beyond the code)

The things the idea doesn't cover yet, roughly in the order you'll hit them.

## 1. Reality checks on the idea

- **"Walk away and it's done" works for most sites, not all.** CAPTCHAs, SMS codes, and ID checks exist
  to stop exactly this kind of automation. The app should pause and ping your phone for those, not try
  to beat them. Getting around a CAPTCHA breaks site terms, can get the user's accounts banned, and
  would get the app pulled from the App Store. Be upfront in marketing: "Most sign-ups need zero taps.
  Some need one."
- **iPhone limits:** Apple doesn't let any third-party app control other apps. On iPhone, full
  automatic sign-up only works in Safari (through a Safari extension) and inside OneTap's own browser.
  Login autofill works everywhere through Apple's Password AutoFill system, the same slot 1Password and
  Bitwarden use.
- **Competition:** 1Password, Bitwarden, Dashlane, Proton Pass and Apple Passwords already handle
  passwords and login. Your edge is **full automatic sign-up with no mistakes, plus auto-declining
  junk.** Lead with that in everything.
- **Auto-accepting Terms of Service** on someone's behalf has to be a clear, informed setting the user
  turns on, with a summary of what was accepted. Never let it accept anything paid.

## 2. Company & legal (Switzerland)

- Register a company (GmbH needs CHF 20,000 capital; a sole proprietorship is cheaper to start) and
  get a VAT number once revenue passes CHF 100,000/year.
- **Swiss nFADP (revDSG) + EU GDPR:** privacy policy, records of processing, data processing agreements
  with every vendor (hosting, AI provider, email, analytics), and an EU representative if you target EU
  users.
- Terms of Service and an end-user licence agreement for the app.
- Trademark search and registration for the final name (IGE/IPI in Switzerland, EUIPO for the EU).
- Check that your hosting and AI providers can contractually guarantee that no personal data is kept or
  used for training.

## 3. Security & trust (this is a password manager; trust is the product)

- Independent security audit (e.g. Cure53, NCC Group, Trail of Bits) before launch: CHF 15–60k.
- Publish a security whitepaper (key hierarchy, what the server can and can't see).
- Bug bounty programme (HackerOne / Intigriti) after launch.
- Incident response plan, and a breach notification process (the FDPIC must be told quickly).
- Consider open-sourcing the crypto and client code. Bitwarden and Proton earned trust that way.

## 4. App stores & distribution

- Apple Developer Program (USD 99/yr) and Google Play Console (USD 25 once).
- Chrome Web Store, Firefox Add-ons, Edge Add-ons, and Safari via App Store Connect.
- App review prep: explain the automation, the credential provider, and why you need each permission.
  Extensions with broad "read all sites" permissions get extra review, so justify it clearly.
- Apple / Google Small Business Programs (15% fee instead of 30%).

## 5. Money

- Rough monthly costs at launch: hosting CHF 50–300, AI fallback calls (falls fast as the site recipe
  cache grows), email aliases/inbound mail, push notifications, RevenueCat (free until USD 2.5k/month
  in revenue).
- At CHF 5/month after the ~15% store fee and VAT, you keep about **CHF 3.90 per subscriber**. Track AI
  cost per sign-up closely so the free tier stays cheap.
- Think about a **family plan** (e.g. CHF 8/month for 5 people) and a **team/business plan** later.

## 6. Data the AI needs

- A **test corpus** of real sign-up and login flows (start with the top 200 sites in CH/DE/FR/IT/US),
  re-checked weekly, because sites change their forms all the time.
- A labelled dataset of form fields to train the on-device classifier.
- A **site recipe** database (anonymous, no personal data) shared across users. That's what makes it
  get faster and better over time, and it's a moat.

## 7. Launch & growth

- Name, logo, website, and a 30-second demo video: "Watch me sign up to 5 sites while I make coffee."
- Closed beta (TestFlight + Play internal testing) with 50–100 people. Measure success rate and wrong
  fills per site.
- Support: help centre, in-app "report a site that failed" button (feeds the recipe fixes).
- Analytics without personal data (e.g. PostHog self-hosted / EU): only success/failure per domain,
  never field values.

## 8. Decisions you still need to make

1. Final name and branding.
2. Does "5 free" mean 5 automatic sign-ups total, or 5 saved accounts? (The prompt assumes 5
   automatic sign-ups, with your passwords always viewable.)
3. Default for auto-accepting required Terms: on (faster) or ask each time (safer)? The prompt assumes
   on, with a clear explanation at onboarding.
4. Native iOS/Android (better security and system integration, as the prompt assumes) or a
   cross-platform framework like React Native / Flutter (faster to build, harder for the credential
   provider parts)?
5. Build it yourself with the agents, hire a developer, or both? A realistic v1 is 4–8 months for a
   small team.
