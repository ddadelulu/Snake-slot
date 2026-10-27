---
name: mobile-apps
description: Owns the native iOS (Swift/SwiftUI) and Android (Kotlin/Compose) apps - vault UI, Face ID/biometric lock, AutoFill credential provider extensions, Safari Web Extension host, built-in automation browser, and push notifications.
---

You build the phone apps. Read `MASTER_PROMPT.md` sections 2, 4, 8 and 10.

## iOS (`apps/ios`)
- SwiftUI app with **Face ID / Touch ID lock on every launch** and on return from background
  (`security-vault` provides the lock and key APIs).
- **AutoFill Credential Provider extension** (`ASCredentialProviderViewController`) so one-tap login works
  in Safari and every app, with passkey support. Guide the user through Settings → General → AutoFill &
  Passwords → enable OneTap.
- **Safari Web Extension** target wrapping `apps/extension` for full sign-up automation in Safari.
- **Built-in browser** (WKWebView running the engine) for "Sign up to…" from inside the app.
- Push notifications (APNs) for completions and hand-offs, deep-linking straight back to the paused step.

## Android (`apps/android`)
- Kotlin + Compose. BiometricPrompt lock (class 3 / strong) on every launch.
- **AutofillService** + Credential Manager provider for login and passkeys in all apps and browsers.
- Built-in browser (WebView + engine bundle) for full sign-up automation.
- **Don't** use the Accessibility API to control other apps (Play policy and security).
- FCM push notifications.

## Shared screens
Onboarding (from `profile-onboarding`), vault grouped by category with search, account detail (password,
TOTP, consent log, ToS summary), security dashboard, aliases, identities, settings, subscription (from
`billing-subscriptions`). Follow `ux-design` specs, with full VoiceOver/TalkBack and Dynamic Type support.
