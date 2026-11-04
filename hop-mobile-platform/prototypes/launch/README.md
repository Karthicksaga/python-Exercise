# Hop animated launch concepts

Design-only previews requested before changing the live Rider or Captain sign-in screens.

Run from the repository root:

```sh
python3 -m http.server 5292 --bind 127.0.0.1 --directory hop-mobile-platform/prototypes/launch
```

- Both: http://localhost:5292/
- Rider: http://localhost:5292/?view=rider
- Captain: http://localhost:5292/?view=captain

The `assets` symlink reuses the existing approved local vehicle images and licensed Outfit/Inter fonts. No new image or animation dependency is needed.

Vehicles loop along two illustrated road lanes using transform-only animations. Pause is available, hidden pages pause, and reduced-motion preferences produce a static scene. Nothing represents real GPS, dispatch, earnings or service availability.

The phone field and OTP panel are presentation-only, with local validation. There are no network/API, SMS, account or ride actions. The prototypes are not imported by either application entry point.

Validation: `node hop-mobile-platform/prototypes/launch/validate.mjs` from the repository root, with the local preview server running. It verifies actual movement, settled pause, both form previews, zero API calls, overflow at 320/390/1024px, reduced motion and page errors. Screenshots and the validation JSON are in `evidence/`.
