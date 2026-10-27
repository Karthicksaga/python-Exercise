# Responsive UI contract

The existing React, Mantine and shared CSS stack remains in place. Start new screens with the existing `.shell`, `.has-nav`, `.page-title`, `.panel`, `.grid-2`, `.form-grid`, `.profile-columns`, and `ResponsiveNav` primitives. Reuse theme variables rather than adding hardcoded light surfaces.

- One navigation breakpoint: desktop sidebar above 820px, bottom dock at or below 820px. Main padding must reserve the bottom safe area and dock height.
- Header and main must use the same sidebar offset. Avoid independent page max-width caps; cards fill the available content region.
- Grid tracks use `minmax(0, 1fr)`. Flexible children need `min-width: 0`. Forms inside narrow cards should collapse according to container width, not only the window width.
- Default button selectors use `:where()` so named components can own layout and color. Never add another high-specificity global button override or theme rule using `!important`. Keep color swatches, map controls and link cards independent from primary action styling.
- Use `--card`, `--bg`, `--ink`, `--ink-2`, `--muted`, `--line` and semantic status tokens. `useDarkMode` synchronizes Mantine and app CSS. Captain gold actions use dark foreground text.
- Booking maps own their bounded canvas. The sheet scrolls on desktop; form sections must not shrink behind sticky actions. Mobile maps and form sheets use document flow, with room for navigation and safe areas.
- Long addresses and names wrap; input values use the browser's native horizontal editing scroll. Do not clip containers to conceal layout overflow.
- Respect reduced motion. Preserve accessible labels, keyboard focus, semantic inputs and touch target sizing when adding controls.

## Browser checks

Run `npm run typecheck`, `npm run build`, and `npm run test:responsive` from this directory. Playwright starts Rider and Captain, mocks API data, visits every primary tab at 320, 360, 390, 430, 768, 1024, 1280, 1440 and 1920 pixels in light/dark mode, checks viewport containment and runtime errors, and captures screenshots. Additional scenarios cover sign-in, populated trip history, accepted live trips and Captain onboarding at 320 and 1024.

The fixture API is a UI test boundary, not evidence that the real backend, payments, OTP, matching or native plugins work. Test those integrations separately. Inspect images and traces in `playwright-report` and `test-results` (CI retains them for 14 days).

## Visual baseline review

`npm run test:visual -- --update-snapshots` captures proposed baselines. Review them before committing `tests/__screenshots__`; do not label generated images as approved automatically. `npm run test:visual` compares against those baselines. Snapshot paths include the full test name so roles, themes and widths never overwrite one another. Generate and compare on the same pinned Playwright/browser/OS combination, preferably Linux CI. Regular CI currently enforces layout assertions and screenshot capture; approved pixel baselines are pending.

## Review checklist

Confirm mobile, tablet, desktop and dark screenshots; no unexpected viewport overflow; readable text; header and dock targets; long address/name data; nested form width; sticky actions; dialogs; and a native Android run when changing safe areas, keyboards, or platform-specific components. Do not accept typecheck/build success as proof of visual correctness.

## Android smoke run

Use Java 21 and a running Android emulator. Start `node tests/native-fixture-api.cjs` locally; build each debug APK with `VITE_MAP_PROVIDER=osm VITE_MOBILE_API_URL=http://10.0.2.2:8080 node scripts/android.mjs rider --apk` (repeat for captain). Install the APKs with ADB and grant location permission in the test emulator. Run `node tests/android-smoke.mjs rider` and `node tests/android-smoke.mjs captain`. This checks real Capacitor WebViews and captures device/profile images in `test-results-android`. The local fixtures contain test identities only. Never ship the emulator API URL in a release build.
