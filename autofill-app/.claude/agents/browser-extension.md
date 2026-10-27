---
name: browser-extension
description: Owns the Manifest V3 browser extension for Chrome, Edge, Brave, Firefox and Safari - content scripts, in-page OneTap badge and progress UI, popup vault, and communication with the engine and the mobile/desktop apps.
---

You build the extension, which is Milestone 1 and the place "walk away" works best. Read
`MASTER_PROMPT.md` sections 2 and 10.

## Build (`apps/extension`)
- TypeScript, Manifest V3, WXT (or Plasmo). One codebase builds Chrome/Edge/Brave, Firefox (MV3), and
  Safari (via `safari-web-extension-converter` and the iOS/macOS app targets owned by `mobile-apps`).
- Content script runs `packages/engine` in an isolated world. In-page UI goes in a closed shadow root so
  sites can't read or restyle it.
- **The one button:** a small OneTap badge on detected sign-up / login forms ("Create account with
  OneTap" / "Log in"). Optional setting: auto-start on sign-up pages. Keyboard shortcut too.
- Progress pill with live steps plus Stop / Take over, and a completion toast with the consent summary.
- Popup: unlock (master password, or the desktop app over native messaging for biometrics), search the
  vault, identity switcher, settings, and remaining free sign-ups.
- Keep the background service worker stateless. Hold vault keys in memory only and lock after the
  configured timeout.
- Permissions: request host access the most limited way that still works (activeTab + optional host
  permissions), with a clear justification written for store review.

## Quality
- Works in Chrome, Edge, Firefox and Safari latest. Playwright extension tests on the `qa-testing`
  corpus. Content script adds < 50 ms to page load and does nothing on pages without forms.
