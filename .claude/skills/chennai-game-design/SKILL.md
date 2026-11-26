---
name: chennai-game-design
description: >
  Art direction, HUD and menu rules, and the screenshot review for the Chennai open-world game in
  Godot (`godot-chennai/`): the Chennai look, phone landscape layouts, touch targets, honest
  loading, motion on weak phone GPUs, people and signs, plus lessons already paid for in the
  Three.js version. Use for any visual, UI, camera-feel or character work in `godot-chennai/`, and
  before reporting screenshots. Load with `game-ui-ux`, `godot-ui-control` and `game-feel`.
---

# Chennai game design (project skill)

The game is an original open world set in **real Chennai** for **Android phones held in
landscape**. Every visual decision serves two things: the player should recognise Chennai, and
it must run smoothly on an entry-level phone. The owner's test phone is a POCO M6 Pro 5G
(Snapdragon 4 Gen 2, **Adreno 613**, 6 GB): design for it, not for a desktop.

## 1. The Chennai look (art direction)
- **Light:** strong tropical sun, warm golden hour (the game starts at golden hour), hazy
  horizon, short hard shadows at noon; monsoon rain and wet roads as a weather state; sodium
  orange street lights at night. Haze hides the streaming edge: use it, don't fight it.
- **Palette:** sun-faded paints (pastel blue, mint, salmon, cream, lime), white-washed walls,
  red-oxide floors and terracotta tiles in old areas, glass and grey concrete on arterials,
  amber (#ffb703) as the game's UI accent. Avoid saturated "cartoon" colours and pure black.
- **Streets:** dense ground floors (shop shutters, painted signboards, chajja sunshades, awnings),
  balconies and water tanks above, overhead cables and poles, coconut and neem trees, yellow-black
  kerbs on main roads, bus shelters, parked two-wheelers, autos. Detail lives at eye level; upper
  floors can be simpler.
- **Signs:** Tamil first with English below, painted-board colours. **No real business names,
  brands or logos** unless the owner changes TD-18 (it is an open decision in the
  reconstruction blueprint §21). Invented names must be generic ("New Stores"), never a real shop.
- **Data honesty:** what OpenStreetMap doesn't provide (heights, colours, widths) is estimated
  and must be described as estimated in docs and credits, never as real.

## 2. People
- Realistic South Indian people, natural skin tones, Chennai clothing (saree, veshti, lungi,
  salwar, chudidar, uniforms, office wear). No stereotypes, no real likenesses, no logos or
  slogans on clothes (the concept boards' delivery logos become plain colours).
- **Children** only where nothing can hurt them: station crowds and as passengers with an adult.
- Check hands, wrists, feet and fingers on grips in screenshots: the Three.js version shipped
  bent wrists (A-pose vs T-pose clips) and sinking soles before tests caught them.

## 3. HUD and menus on a phone in landscape
- **Reference sizes:** 915×412 (small phone) and 1830×824 (2× density), plus 640×320 as the
  worst case. Every screen is checked at all three.
- **Safe areas:** respect `DisplayServer.get_display_safe_area()`; nothing interactive under a
  notch or the gesture bar.
- **Touch targets:** at least 48 dp (about 9 mm), 8 dp apart. Primary actions in the thumb zones:
  movement stick bottom-left, actions bottom-right, camera drag on the right half.
- **Nothing overlaps and nothing is clipped.** The Three.js pause menu once cut off its first and
  last buttons on landscape phones because a centred box couldn't scroll. Menus that can outgrow
  the screen go in a `ScrollContainer` and wrap (`HFlowContainer`/grid); write a headless layout
  test that asserts every button's rect is inside the viewport and none overlap (the old
  `driving.spec` "controls reachable at phone size" test is the pattern).
- **Context, not clutter:** buttons appear when they apply (ENTER near a vehicle, HIJACK by stopped
  traffic, BLOCK/DODGE in a fight). No permanent buttons for rare actions.
- **Only real options.** No placeholder buttons, no settings that do nothing.
- **Text:** Noto Sans Tamil and a clean Latin sans; minimum 12 sp for body text, 14 sp for
  buttons; high contrast on a dark translucent panel over the 3D view.
- **Keyboard/D-pad focus** works on every menu (Bluetooth controllers, accessibility); Back on
  Android goes one level up, then pauses, then to the title, then quits.

## 4. Loading and the title menu
- **Honest progress:** show the real loading steps (read the map, physics, streets, people,
  traffic, rail), one segment per finished step. Never invent a percentage.
- **Never block the main thread:** load and decode in the background (`ResourceLoader` threaded
  requests, `WorkerThreadPool`), build chunk meshes and colliders in time-sliced steps, add a
  chunk to the scene only when complete. In the Three.js version one chunk took ~20 ms to build
  on a desktop, so a visible jerk on a phone every time a chunk appeared while riding.
- **Nothing loops while loading.** On the Adreno 613 the animated loading screen's layers failed
  to draw (white boxes, then a black screen, then the app closed). Keep the loading screen
  static apart from the step changes; no full-screen fades over the first game frames.
- Failure shows what failed and **Try again** / **Close**, never a black screen.

## 5. Motion and feel
- Use `game-feel` for juice, but budget it: screen shake only on impacts, small, and off with
  reduced motion; hit-stop at most a few frames.
- **Chase camera:** smooth follow, look ahead with speed, pull in when blocked but ease (an instant
  pull-in on every passing pole or pedestrian reads as shaking). Test the camera at speed on a
  long ride and measure frame-to-frame jumps.
- Honour reduced motion (`OS`/settings flag): no shake, no drifting backgrounds, instant
  transitions.

## 6. Performance is part of the design
- Budget at the densest street: about 230–300 draw calls and 300k triangles (TD-18). Characters
  ~10k triangles near, ~3.5k far (LOD at ~30 m); vehicles LOD at ~28 m; textures 512 px on phones.
- Instance repeated things (`MultiMeshInstance3D`), share materials and atlases, warm shaders at
  load (first-use compiles hitch), avoid per-frame allocation.
- A design that needs more than the budget gets an LOD or a cheaper look, not a bigger budget.

## 7. Screenshot review (do this before every report)
Take Compatibility-renderer screenshots under xvfb at 915×412 and 1830×824 (and 640×320 for UI),
open them, and check each item; fix or report every failure plainly:

1. Does it read as Chennai (light, palette, street life, signs), not a generic city?
2. Any clipped, overlapping or off-screen UI? Any text too small or low-contrast?
3. Are touch targets big enough and in thumb reach?
4. People: hands, wrists, feet on the ground, clothes, skin tones, no logos.
5. Vehicles: wheels on the road, riders seated with hands on the grips.
6. Seams, z-fighting, floating or sunk objects, gaps at chunk edges.
7. Anything that would cost too much on the Adreno 613 (overdraw, many transparent layers,
   full-screen effects)?
8. Is anything invented presented as real?

Report what you looked at, with paths to the screenshots, and say plainly what is weak.
