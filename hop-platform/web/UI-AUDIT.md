# Hop frontend repair audit — 26 October 2026

## Scope and inventory

The repository has 69 TSX modules across the three web apps and shared package. This is a source-module count, not a rendered component-instance count. There are 27 primary authenticated navigation destinations: six Rider tabs, six Captain tabs and fifteen Admin views. Authentication, public trip sharing, booking steps, application steps and live-trip states are additional conditional screens. Android uses Capacitor WebViews, not React Native. See UI-INVENTORY.md for the source module and class inventory and UI-ROUTES.md for the destination-by-destination verification checklist.

The screenshot of an unrelated access-request application is not implemented by this repository and was not modified.

## Confirmed causes and repairs

1. Shared style.css generic button selectors accumulated many `:not()` clauses. Their specificity overrode named controls. Converted those defaults to `:where()`, consolidated competing default sizing rules, and retained named control styles. Removed Captain and Rider dark-mode blanket `!important` primary-button overrides. These rules were recoloring avatar swatches and profile action cards, including helper text on gold backgrounds.
2. `.has-nav main > *` switched from a 1080px cap to 1480px at 1500px, while `.profile-grid` separately capped itself at 1080px. Removed competing inner caps; the profile and cards fill the available main region. Header margins now follow the sidebar offset above the shared 820px navigation breakpoint.
3. `.profile-trust` forced two tracks inside the narrow profile sidebar. It now stacks verification and portrait blocks. Nested profile forms use container queries to collapse when their actual card becomes narrow. Grid and flexible children have explicit intrinsic shrinking rules; file controls are bounded by their containers.
4. Captain statistics always reserved five tracks despite having four values. Replaced that fixed desktop count with intrinsic auto-fit tracks. Mobile retains two tracks.
5. Profile layout declarations were duplicated. Consolidated the repeated `.profile-grid` blocks and removed its dark background so the layout wrapper does not paint a large slab behind individual cards.
6. Header icons were constrained by competing 32px and generic button padding rules, causing cramped labels. They now have explicit 44px targets; compact header spacing handles 320px screens.
7. Booking sheet form sections could shrink in the fixed-height flex container around sticky actions. Prevented shrinking of fieldsets, saved-place controls and action rows. Preserved the existing desktop scroll panel and mobile document-flow map/sheet model.
8. App CSS themes and Mantine's independent color scheme could disagree. `useDarkMode` now updates both. Actual Android screenshot inspection also showed dark status-bar icons on dark app content; the hook now sets Capacitor's built-in SystemBars style with the app theme.
9. Phone sign-in used a generic text input with numeric input mode. Added semantic `type="tel"` without changing OTP submission or validation.

## Verification coverage

Playwright runs deterministic mocked UI data for both roles, with long names and addresses. Base coverage visits all twelve Rider/Captain navigation tabs at 320, 360, 390, 430, 768, 1024, 1280, 1440 and 1920 CSS pixels in both themes. It captures full-page screenshots, checks document and form/card/header viewport containment, watches runtime errors, verifies Mantine's theme attribute, and asserts all six avatar swatches retain distinct colors.

Additional scenarios cover Rider/Captain sign-in, populated completed/cancelled trip history, Rider accepted live trip and Captain vehicle onboarding at 320 and 1024 in both themes. Booking progression covers destination selection, ride choice and fare confirmation at 320, 768, 1024 and 1920 in both themes. Total: 68 browser scenarios. This does not constitute exhaustive testing of every conditional business state.

The consolidated 68-scenario Chromium run passed. Palette assertions specifically protect against the recoloring defects found during screenshot review.

TypeScript checks and Rider, Captain and Admin production builds passed. Vite reports an existing Rider MapPicker static/dynamic import chunking warning; it does not fail the build. Repository-wide diff whitespace checks report pre-existing blank lines in the two environment example files; those were left alone.

## Automation and maintenance

Added playwright.config.ts, tests/responsive.spec.ts and tests/android-smoke.mjs, plus responsive/visual npm scripts. CI now runs TypeScript, builds and Playwright, and retains browser screenshots/traces/reports for fourteen days. RESPONSIVE-UI.md documents layout rules, theme ownership, test boundaries and review expectations.

Pixel comparison is available via `npm run test:visual`; approved baselines do not yet exist. Regular CI enforces layout/runtime assertions and captures screenshots. Generate proposed baselines on the CI OS, review them and commit them before claiming approved visual regression protection. Snapshot directories include each test's role/theme/width to prevent collisions.

## Files changed by this repair

- packages/shared/src/style.css
- packages/shared/src/responsive.css
- packages/shared/src/useDarkMode.ts
- packages/shared/src/PhoneLogin.tsx
- apps/captain/src/captain.css
- package.json and package-lock.json
- playwright.config.ts and tests/
- UI-INVENTORY.md, UI-ROUTES.md, RESPONSIVE-UI.md and this report
- ../../.github/workflows/hop.yml and ../../.gitignore

Pre-existing backend, infrastructure, payment, map, ProfilePanel and other working-tree changes were preserved. No backend business contracts were rewritten by this repair.

## Remaining verification work

- Admin's fifteen destinations have source inventory and production/type checks; they have not all been rendered with operator fixtures at every viewport.
- Public sharing, every Captain onboarding step, every trip lifecycle/negotiation/payment state, all dialogs and error states need broader screenshot and interaction coverage. No exhaustive overlap or accessibility audit is claimed.
- Mocked browser tests do not validate real OTP delivery, OAuth redirects, matching, live map services, payment gateways, push delivery, tracking or backend state transitions. Run existing backend tests and staging end-to-end journeys separately.
- Approved visual baselines and automated screenshot comparisons remain pending review.
- Android validation is a limited emulator smoke test, not full device, keyboard, permission, background-tracking or production-journey certification.

## Final-run result

The consolidated Chromium run passed all 68 scenarios (2.3 minutes). Both Android debug builds passed after reinstalling a fresh copy of the declared push plugin version. The initial local plugin source did not match the clean installed copy; no dependency downgrade is retained. Final Rider native smoke passed in light and dark themes on the Android 35 sdk_gphone64_arm64 emulator at 411 CSS pixels: document width stayed 411px, CSS and Mantine themes matched, and device screenshots confirmed readable system-bar icons. Final Captain native smoke also passed in both themes at 411 CSS pixels, with matching document width and matching CSS/Mantine themes. Both final debug APKs include the system-bar synchronization. Device and full-profile captures are in test-results-android/.
