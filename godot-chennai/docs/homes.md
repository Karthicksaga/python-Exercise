# Homes: buy a home, walk in, furnish it, extend it, save (G-230 to G-238)

The owner reviewed a prototype (`home_prototype.html`, with the design notes in
`suggestions/2026-11-24-chennai-culture-and-life.md`) and asked for the idea in the real game. This
file says what is built, where the numbers are, how to tune it, and what needs a native speaker.

## What the player does
1. Walks along a street in Anna Nagar, Besant Nagar, Velachery or Mylapore. Some real buildings
   have a **FOR SALE** board in Tamil and English (the kind of home, the price; never a business
   name), a wooden door frame and a door on the wall that faces the road.
2. Stands at the door: the ACTION button reads **BUY · ₹6,000** (dimmed while too poor; pressing it
   then says what is missing). After buying it reads **ENTER** and the board reads **MY HOME**.
3. ENTER opens the door, the player walks to it with their own model and clips, the screen fades,
   the street is put away, and they walk into a room: day or night by the game's clock, a window,
   a door frame, the verandah with the kolam if it is switched on.
4. Inside, ACTION offers **FURNISH**, **SLEEP** (the life rules' own sleep: until 07:00, health
   restored, game saved) and **LEAVE** at the door. LEAVE (top right) and Android Back also leave.
5. FURNISH opens the editor (see below), including ROOM + (up to two extensions of 3 m), wall
   colours and the KOLAM switch.

## Where things are
| What | File |
|---|---|
| Data | `data/homes/homes.json` (4 types), `props.json` (47 props), `prices.json` (every price, one scale), `listings.json` (OSM building ids per area) |
| Pure logic (no nodes) | `src/homes/`: `HomeCatalog`, `PropCatalog`, `HomePrices`, `HomeListings`, `HomeState` + `OwnedHome` + `PlacedProp`, `HomeEditor` (rules), `HomeRoom`, `HomeRules`, `HomeWalker`, `HomeKolam`, `PropMesh`, `FurnitureMesh` |
| Glue | `src/app/homes_layer/`: `HomesLayer` (the flow), `HomeSite` (door and standing spot on the real map), `HomeSiteView` (board and door), `HomeInterior` (+ `.tscn`) |
| UI | `src/ui/home_editor/home_hud.gd` |
| Tests | `tests/unit/test_homes.gd`, `test_home_sites.gd`; `tests/scene/test_home_interior.gd`, `test_homes_layer.gd` (the whole flow through `main.tscn`) |
| Tools | `tests/tools/home_picker.gd` (candidate buildings), `tests/tools/homes_shots.gd` (screenshots and render numbers) |

## Prices (G-231): one constant
`data/homes/prices.json` holds the prototype's prices; the game charges `price x scale`, rounded to
₹5 and never under ₹5. **`scale` is 0.05.** Why: stages and jobs pay ₹50 to ₹1,200 each (about
₹58,000 in the whole baked content), so the prototype's ₹60,000 to ₹180,000 homes could never be
reached. At 0.05:

| | Prototype | Game |
|---|---|---|
| Flat / Beach cottage / Terrace house / Old house | 60,000 / 90,000 / 120,000 / 180,000 | **₹3,000 / 4,500 / 6,000 / 9,000** |
| Extension 1 / 2 | 20,000 / 40,000 | **₹1,000 / 2,000** |
| Sofa / fridge / diya / calendar | 4,500 / 9,000 / 200 / 150 | ₹225 / 450 / 10 / 10 |
| Whole catalogue of 47 props | | under ₹10,000 |

A flat is a few stages or about ten jobs, the old house is a late goal, furnishing is a steady
sink. Removing a piece pays back half (rounded down). To make everything dearer or cheaper,
change `scale` only; a test checks the economy stays inside these bounds.

## Furnish editor (G-232, G-237)
Rules ported from the prototype and unit-tested: floor pieces take their footprint's cells and turn
in quarter turns (width and depth swap); a ceiling piece takes one cell; a wall piece hangs on the
nearer of the back and left walls. Differences, on purpose: a wall piece takes `w` slots of its wall
(the prototype took one, so a 2 m tube light overlapped its neighbour), and **floor pieces never
cover the two doorway cells** so the way in stays open. Paths for the walking person are found over
the same grid (a mat can be walked over).

Layout for 915x412 (and 1830x824, which is the same in UI units): category tabs in a column on the
right with the list of pieces (name, price on one line, Tamil on the next); tools along the bottom
left (ROTATE, REMOVE, CLEAR, ROOM +, WALLS, KOLAM); DONE and the home's name, wallet and time top
left; the room is pushed left so the panel never hides it. Every button is at least 48 tall (a test
checks four screen shapes), no thumb zone holds anything but a button: with the editor closed the
only controls are LEAVE (top right) and the context buttons (bottom right).

## The interior (G-235, G-236)
- A separate scene made on entering and freed on leaving; the OSM building is untouched.
- **The world is put away, not paused:** `HomesLayer` sets the city's `process_mode` to disabled
  (no AI, traffic, streaming, scripts), stops the physics server and hides it. The tree is not
  paused, so the game clock keeps running (you can watch dusk fall inside) and the sound system
  runs. Sound: `Sound.suspend()` then `set_place(INF, 0.08, true)`: the quiet enclosed bed (low
  pass, no birds, no horns).
- The player's own `HumanFigure` is reparented into the room and back, so it is the same model
  with the same clips.
- Light: the room's one `OmniLight3D` (on at night), the sun as one `DirectionalLight3D` (no
  shadows), colours from `Lighting.at(hour)`. Lamps, tube lights, bulbs and the pooja flame are
  vertex-coloured parts in a second mesh that goes unshaded (glows) at night; there are no other
  real lights.
- Peace zone (`HomeRules`): no combat, no weapons, no wanted level inside, a safe save point.
  ENTER is refused while driving ("Park your vehicle first") and with police stars
  ("The police are watching"): `HomesLayer.wanted_stars` is a Callable the combat runtime sets
  when a live wanted level exists (it does not yet, so it reads 0).
- No children, no other people inside: nothing can be hurt. Pooja items are architecture only: a
  shelf, a brass lamp and a flame; no deity images (a test checks the parts are plain geometry).

## Save (G-234)
Own section `chennai-homes-v1` in the same file (`SaveStore`), written through the missions'
`MissionSession.save`: `{version: 1, current, owned: {listing id: {type, extensions, wall, kolam,
items: [{k, x, z, r, wall?}]}}}`. A save without it is a new game with no homes; damaged data is a
new game; a section with `version` above 1 is left untouched and written back as it was; homes of
an unknown type are kept; pieces of unknown props or that no longer fit are dropped on load
(counted). NEW GAME forgets the homes.

## Numbers
Filled in `docs/handoff.md` (Homes section): draw calls, triangles, data size.

## Tamil: needs native review
Every Tamil string is the prototype's (`props.json`, `homes.json`, the four area names from the
areas data, which marks them "osm; needs native review") or written for this feature and **not
reviewed by a native speaker**: the feature lines of the four homes, the category names, every
button (DONE முடிந்தது, LEAVE வெளியே, ROTATE திருப்பு, REMOVE அகற்று, CLEAR அனைத்தும், ROOM + அறை +,
WALLS சுவர், KOLAM கோலம், FURNISH, SLEEP), the sign (விற்பனைக்கு "for sale", என் வீடு "my home") and
the toasts in `HomesLayer`/`HomeEditor`/`HomeState`. Tamil is drawn in Noto Sans Tamil Bold
(`TitleFonts`), as a fallback behind Barlow Condensed.

## Not done
See `docs/handoff.md` (Homes).

## Numbers (24 Nov 2026, Compatibility under llvmpipe)
Furnished room in 3D: 8 draw calls, 8,082 primitives; with the furnish panel open 88 draw calls
(the buttons); street view with a board 158 to 172 draw calls (the city). 47 props: 5,726
triangles in all, the largest 648. Data 28 KB. See `docs/handoff.md`.
