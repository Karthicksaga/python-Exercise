# Chennai Open World

An original open-world game for Android set in real Chennai geography, starting with Anna Nagar.
Inspired by the open-world genre; all content (names, characters, missions, art) is original.

**Status: early playable build.** About 1 km² of real Anna Nagar streets and building
footprints, an animated character, three drivable vehicles, AI traffic and pedestrians, fist
fights and gunfights, sound, and ten mission stages. Tested on an Android emulator, not yet on a phone. `docs/progress.md` lists
exactly what works, what was tested and what is still placeholder.

## Requirements

- Node 22.11 or newer
- JDK 17–21 (`JAVA_HOME` must point to it; JDK 11 does not work)
- Android SDK (platform 37, build-tools 37, NDK 27.1; Gradle installs missing parts when the
  SDK licences are accepted)

## Commands (from this folder)

```sh
npm install                 # game runtime and packages
npm run dev                 # play in a desktop browser: http://localhost:5173 (WASD, mouse drag, Space, E get in/out, Q punch, F fire, H horn)
npm run typecheck           # TypeScript, strict
npm test                    # unit tests (map data, vehicle physics, missions, AI, combat)
npm run build:world         # rebuild the world file after changing the OSM extract or world rules
npm run fetch:osm           # download a fresh OpenStreetMap extract
npm run test:e2e            # browser tests of the built game with touch input

(cd apps/mobile && npm install)   # once: React Native shell
npm run sync:android        # build the game and copy it into the Android app
cd apps/mobile/android && ./gradlew assembleRelease    # APK: app/build/outputs/apk/release/
adb install -r app/build/outputs/apk/release/app-release.apk
```

The release APK is signed with the debug key for now; it is for testing, not for the Play Store.

## Continuous integration

`.github/workflows/chennai-open-world.yml` runs on every push and pull request that changes this
folder (and can be started by hand from the Actions tab):

1. **test**: `npm run typecheck`, `npm test` and `npm run test:e2e` in headless Chromium. On
   failure the Playwright results are attached to the run.
2. **web**: builds the game; the build is attached as the `chennai-open-world-web` artifact.
3. **android**: builds the release APK, attached as `chennai-open-world-apk` (debug-signed, for
   testing only).
4. **deploy**: on pushes to `feat/chennai-open-world` or `master` (and manual runs), publishes
   the web build to GitHub Pages.

To download the web build or the APK, open the run under **Actions**, scroll to **Artifacts** and
download the zip. To play the web build, unzip it and serve the folder over http (for example
`python3 -m http.server` inside it), then open the printed address.

To play in the browser through GitHub Pages, enable it once: repository **Settings → Pages →
Source: GitHub Actions**. The next deploy prints the link on the run page. Until Pages is enabled
the deploy job fails (the other jobs' results still stand). If the `github-pages` environment
only allows the default branch, add `feat/chennai-open-world` under **Settings → Environments**. The Pages link is public: anyone with the URL can
play the build.

## Layout

```
apps/game/      game runtime entry (Vite): wires the packages, keyboard fallback, native bridge
apps/mobile/    React Native shell (Android): menu, WebView host, lifecycle
packages/       map-data, game-world, game-engine, physics, player, vehicles, ai, missions, combat, audio, ui
assets/         OSM extract, character model, animations (licences: assets/README.md)
docs/           architecture, technical decisions, roadmap, progress
scripts/        build helpers
```

## Map data

Map data © OpenStreetMap contributors, Open Database Licence (ODbL). The credit is shown on the
minimap, the pause screen and the main menu. Extract details: `assets/osm/README.md`.
