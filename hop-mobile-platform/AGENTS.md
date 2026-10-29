# Hop mobile design contract

Applies to all files inside hop-mobile-platform, for every model and agent.

- The user's approved UI is `../hop-platform/prototypes/mobile-first/`.
- Read `.agents/skills/hop-mobile-design/SKILL.md` at the repository root before UI work.
- Match the prototype's colours, fonts, text, icons, images, spacing, component sizes, navigation, sheets, states and interactions exactly.
- Both app entry points mount `shared/design/mountPrototype.ts`, which imports the canonical prototype renderer and stylesheet directly. Keep this single visual source.
- `shared/design/standalone.css` may remove only the review frame; it must not override app components.
- Do not use the existing production Rider/Captain UI, the archived TypeScript renderers, or a new “live” shell as a design reference.
- Existing backend code is a reference only for functionality and API contracts. Leave it unchanged.
- Connect real data/actions behind the approved UI. Never replace it with a simplified integration screen or display fabricated success after errors.
- Maps, immediate city search/booking/trip actions, sign-in, chat and notifications use existing backend adapters. Advanced features still contain prototype data; see README limitations. Do not call the applications production-ready or fully backend-integrated.
- Preserve accessibility, mobile safe areas, large text, dark mode, keyboard access, anchored actions and bounded content scrolling.
- Run `npm run typecheck`, `npm run build`, and `npm run test:design` from this folder after changes.
- Never update visual expectations to accept drift. Correct the implementation against the canonical source.
- Hop Commute is intentionally disabled by user request. Keep its home control and review-navigation entries hidden and its navigation guard active until explicitly asked to enable it.
- The login, payment and recovery designs are user-approved. Live implementations use shared/payments and shared/journey adapters; isolated design-only review links remain at `?prototype=login`, `?prototype=payment`, and `?prototype=states`; these review URLs must never mount live adapters, send SMS, charge money, or change device permissions.
- Search must use the selected service area (initially the Chennai map area), not the first entry returned by `/api/config`. Preserve loading/auth/error results across re-renders.

- Approved typography: Outfit for headings/amounts and Inter for body/controls. Variable fonts and licences are bundled locally; do not restore DM Sans/Manrope or add a runtime Google Fonts dependency.
