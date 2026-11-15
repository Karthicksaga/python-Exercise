# Progress, testing and known issues

Last updated: 15 Nov 2026.

## What exists

- **World:** about 1 km² of real Anna Nagar from OpenStreetMap: 136 road pieces, 1,292 building
  footprints, Tower Park and other green areas, 512 trees. Split into 16 chunks of 250 m that
  load and unload (meshes and collision) as the player moves.
- **Player:** a rigged human with idle, walk and run animations, walking, running, jumping,
  collision with buildings and trees, and a third-person camera that avoids walls.
- **Vehicles:** hatchback, auto-rickshaw and motorbike with suspension, steering, braking and
  reverse. Get in and out; the rider is visible, seated, on the bike and in the auto; the bike
  leans into corners. Eleven are parked around the map.
- **AI:** traffic that follows the real road network in the left-hand lane, slows for corners
  and stops for the player, parked vehicles and pedestrians; pedestrians walking beside the
  roads, passing each other. Both turn round at dead ends and are recycled around the player.
- **Combat:** player health (shown as a bar, heals after six seconds unhurt), punching (HIT),
  a pistol with ammunition and aim assistance (FIRE shoots where the camera looks), bullet
  tracers. Enemies notice the player, run in and punch, or stand off and shoot when armed; they
  step round walls, can be run over, and fall when beaten. Being knocked out costs a ₹100
  hospital bill and restarts the stage.
- **Missions:** ten stages. 1 walk, 2 drive to the park, 3 timed auto fare, 4 timed parcel run,
  5 cross-town dash, 6 timed bike courier, 7 fist fight in Tower Park, 8 armed bike thieves then
  ride the bike back, 9 four armed guards, 10 the boss and his men at the Roundtana. Money
  rewards; progress is saved on the device.
- **Sound:** synthesised engine note that rises with speed, horn, doors, gunshots, punches,
  hurt, objective chime, stage fanfare and failure. No sound files.
- **Interface:** joystick, camera drag, context ENTER/EXIT button; JUMP, HIT and FIRE (with
  rounds left) on foot; GAS, BRAKE and HORN when driving; money and stage, health bar, the real
  name of the street underfoot, objective with distance and countdown, speedometer, rotating
  minimap with the objective, vehicles and enemies, a light beacon at the target, pause with
  New game.
- **Android app:** React Native shell with a native menu, landscape, full screen, Back and
  background handling, and an error screen.

## What was tested, and how

| Check | Result | How |
|---|---|---|
| TypeScript strict | pass | `npm run typecheck`; `cd apps/mobile && npx tsc --noEmit` |
| Unit tests (38) | pass | `npm test`: projection, OSM parsing, vehicle physics, mission rules, road graph and agents (including dead ends and people passing each other), combat rules |
| Browser tests (18) | pass | `npm run test:e2e`: production bundle in headless Chromium with touch events. Map streaming, walk/run, camera, jump, collision with a real building, driving all three vehicles, steering, AI traffic moving, stages 1, 2, 7 (fist fight) and 8 (pistol), being knocked out, health bar and street name, saved progress, new game |
| Android build | pass | `./gradlew assembleRelease` (JDK 21, arm64-v8a), APK about 23 MB |
| Android emulator | pass | `Medium_Phone_API_35` (Android 15, WebView 157) on an Apple-silicon host GPU: 57–60 fps with traffic and pedestrians; walked to the hatchback, got in, drove at 55 km/h, objective advanced; saved progress survived a reinstall; no graphics errors in the device log. The build with combat was opened there (60 fps, new buttons, health bar and street name shown) but no fight was played on the emulator.|
| **Real Android phone** | **not tested** | No phone was connected. Frame rate, heat, memory and two-thumb touch are unknown |

Not covered by any automated test: stages 3 to 6, 9 and 10 end to end (their rules are
unit-tested; the routes are not driven and the last two fights are not played through), sound
(nothing checks what is heard), the bike and auto on the emulator, and long play sessions.
Difficulty has not been play-tested by a person.

### Phone test checklist
1. `adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
2. PLAY loads the street within about ten seconds.
3. Left thumb moves, right thumb looks, both at once. JUMP works while moving.
4. Walk into a wall and a tree: the player stops.
5. ENTER a car: steer with the left thumb while holding GAS with the right. BRAKE, then hold
   BRAKE to reverse. EXIT only works when nearly stopped.
6. Note the fps on foot and at speed, and the phone model. Play for ten minutes and note heat.
   Check that sound plays (engine, horn, shots) and isn't too loud or harsh.
7. Finish stage 1, close the app, reopen: money and stage are kept.
8. Back: pause. Back again: menu. Switch apps and return: paused.

## Known issues and limits

- **Buildings:** footprints are real; heights, floor counts and colours are estimates (the
  extract has none). No landmark models (Anna Nagar Tower is not modelled). Facades are
  procedural textures, not photographs. Mapped building coverage is patchy in places, which
  shows as empty lots.
- **Character:** placeholder with an unsuitable licence for release; see `assets/README.md`.
  No jump, get-in or driving animations (the seated pose is a fixed pose).
- **Roads:** flat, no kerb height, no medians (trees mapped on medians are left out), no
  traffic signals or signs. One-way streets are respected by traffic, not enforced on the player.
- **AI:** traffic does not overtake or plan routes, and can queue behind a vehicle the player
  leaves in a lane (agents stuck for 8 s out of sight are moved). AI autos have no visible
  driver. Pedestrians don't react to danger, gunfire or the horn, and can't be hurt. No police
  or wanted level.
- **Combat:** enemies have no pathfinding (they head straight for the player and side-step
  walls), don't take cover, and exist only during their stage. Punching and aiming are arm
  poses, not animations; a beaten enemy simply lies down. Shooting only works on foot. Bullets
  are instant and never hit pedestrians or vehicles. Balance is a first guess.
- **Vehicles:** cannot roll or pitch (by design, TD-8); no damage; no collision or tyre sound.
- **Sound:** synthesised tones, not recordings, and no music or city ambience.
- **Performance:** about 270–300 draw calls and 290k triangles with everything on screen. Fine on
  the emulator's desktop GPU; unknown on phones. Each pedestrian is a full skinned character.
- **Bundle:** 8.1 MB, of which about 2.7 MB is the character embedded as base64 (TD-3).
- **Not built:** inventory or shops, more weapons, settings screen (including a mute switch),
  interiors, weather, day/night.
- The release APK is signed with the debug keystore and built for arm64 only.
