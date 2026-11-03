# Application motion

Rider and Captain share `shared/design/MotionController.ts` and the live animation stylesheet. Screen entrances use a short fade and slide; cards stagger, sheets lift into view, login artwork enters, and controls provide press feedback. Map canvases stay stationary. API refreshes on the same screen do not replay entrance motion.

Animations never delay navigation, authentication, API requests or focus. System reduced-motion preferences disable decorative transitions, including when the setting changes while the app is open. Finished animations release their transforms; hidden pages cancel active animations.

Signed-out launches open the login screen while session validation runs. Existing valid sessions continue to the relevant home screen. Authentication failures remain on login with an error; startup does not request an SMS.

Guidance: [W3C prefers-reduced-motion technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) and [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions).

The demo recording uses intercepted test data; it does not demonstrate live SMS, payments or ride dispatch. Native performance and device acceptance remain to be checked on physical phones.

## Local browser testing

Start each Vite server with `BACKEND_URL` set to its matching staging gateway. Browser API/auth requests use the local proxy. The development proxy translates an origin belonging to its own local page into the backend origin; unrelated origins remain unchanged and are rejected by staging. CSRF tokens and session checks remain enforced. This configuration does not change native transport or production backend policy.

## Animation audit and rollout plan (2026-11-03)

The current stack is Vite/TypeScript, Capacitor for Android, the shared canonical prototype renderer, Web Animations in `MotionController`, CSS in `animations.css`, and Google Maps/Leaflet adapters. There is no React or React Native runtime or dedicated animation package in this app, so motion should stay in the existing shared layer.

- **Critical:** GPS marker interpolation between validated, fresh positions; heading rotation; route progress derived from server route geometry; cancel interpolation for stale updates, route changes, hidden pages and reduced motion. Never synthesize location or trip state.
- **High priority:** welcome/login/OTP, booking and vehicle selection, Captain search and acceptance, tracking, payment and completion. Use the existing motion controller and CSS, and make transitions interruptible. Animate only opacity and transforms when possible.
- **Decorative:** card entrances, button feedback, navigation polish, dialogs, sheets and loading indicators. Limit simultaneous animations and avoid repeating entrances on API refresh.

Use quick (160 ms), control (200 ms), screen (240 ms) and spring-like easing `cubic-bezier(.22,1,.36,1)` as the shared baseline. Keep all motion optional under `prefers-reduced-motion`, and use shorter transitions for low-data devices. Browser and physical Android checks must cover both roles, short screens, keyboard navigation, reduced motion, stale GPS, and interrupted transitions before release.
