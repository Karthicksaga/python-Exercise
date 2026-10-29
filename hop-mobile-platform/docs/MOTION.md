# Application motion

Rider and Captain share `shared/design/MotionController.ts` and the live animation stylesheet. Screen entrances use a short fade and slide; cards stagger, sheets lift into view, login artwork enters, and controls provide press feedback. Map canvases stay stationary. API refreshes on the same screen do not replay entrance motion.

Animations never delay navigation, authentication, API requests or focus. System reduced-motion preferences disable decorative transitions, including when the setting changes while the app is open. Finished animations release their transforms; hidden pages cancel active animations.

Signed-out launches open the login screen while session validation runs. Existing valid sessions continue to the relevant home screen. Authentication failures remain on login with an error; startup does not request an SMS.

Guidance: [W3C prefers-reduced-motion technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) and [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions).

The demo recording uses intercepted test data; it does not demonstrate live SMS, payments or ride dispatch. Native performance and device acceptance remain to be checked on physical phones.

## Local browser testing

Start each Vite server with `BACKEND_URL` set to its matching staging gateway. Browser API/auth requests use the local proxy. The development proxy translates an origin belonging to its own local page into the backend origin; unrelated origins remain unchanged and are rejected by staging. CSRF tokens and session checks remain enforced. This configuration does not change native transport or production backend policy.
