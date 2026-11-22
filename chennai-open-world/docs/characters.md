# Characters

How the people of the city are made (the assets pipeline) and how the game uses them. The
assets side (`tools/blender/characters.py`, the manifest it writes) is documented by its own
branch; this file starts with the game side.

## Integration

**Manifest.** `assets/models/people/people.json` lists every person:
`{ id, file, lod1, sex, age, roles, heightM, triangles, lod1Triangles, texture }`, paths
relative to `assets/models/` (the optimised copies, same paths, are under `assets/optimized/`).
`age` is one of child, teen, young, middle, elderly; `roles` are from pedestrian, auto-driver,
cab-driver, traffic-police, police, vendor, tea-worker, construction, delivery, shopkeeper,
office, college, school, passenger. `parsePeopleManifest` (`packages/player/src/people.ts`)
reads it: a broken entry is left out with a console warning, never a crash. Until `people.json`
existed, `people.fixture.json` (the four interim MPFB men and the old placeholder) stood in;
the game picks `people.json` whenever it is there, and the fixture can be deleted.

**Loading** (`apps/game/src/peopleFiles.ts`, `HumanAssets` in `HumanFigure.ts`). Each model is a
lazy `?inline` import (embedded in the one script, TD-3, decoded only when first needed). At the
start the game loads the people who can be pedestrians and drivers; the rest load the first
time someone asks for them (`HumanAssets.look`): police at the first star, the platform crowd
when the player first comes near a station, fare passengers at their stop. Until then a loaded
person of the same cast stands in (enemies are swapped for the right person once loaded). Each
model is loaded once; copies share geometry, textures and clips. Clips are retargeted once per
skeleton (same rig and rest pose: same clips).

**Fit.** Each person is drawn at `heightM` (children and the elderly shorter; the player stays
`PLAYER_HEIGHT`), with the lowest vertex of the rest pose (the soles) on the ground. The walk and
run play faster for shorter legs (stride from hip height relative to the player's), so feet
don't slide. The retargeted clips also lower the hips frame by frame so the lower foot keeps its
rest height (the clips carry no hip movement; without it walkers floated 2–5 cm and runners
about 10 cm). Browser-tested: soles within 5 cm of the ground standing, walking and running.

**Who plays whom** (`CASTS` in `people.ts`; only assignment, nothing about where or how people
move changed):

| Cast | People | Stand-in when nobody has the role |
|---|---|---|
| Street pedestrians | `pedestrian`, mixed (consecutive walkers get different people, interleaved by sex and age) | any adult |
| Story enemies, gang members | grown men (young, middle) with `pedestrian`; gang colours as a dye | any grown man |
| Police officers | `police`, `traffic-police` (own uniform) | a grown man dyed khaki |
| AI auto drivers | `auto-driver` (own clothes) | a middle-aged or elderly man dyed khaki |
| Car, bus, truck drivers | `cab-driver` | office/pedestrian adults |
| Platform crowd | four people as different as possible (sex and age, children allowed), plus a `tea-worker` at the stall | |
| Fare and share-auto passengers, bus | `passenger`, `pedestrian`, `office`, `college`, `school`; a child only as the second or later of a party | |
| Wedding party (stage 16) | as passengers, preferring ids with saree, veshti, silk, pattu | |
| Patients | elderly passengers | |

**Children are never cast where they can be hit, shot or hurt**: pedestrians, enemies, police
and drivers exclude `child` and `teen` (unit-tested against any manifest, and against the real
one when present). Platform crowds are baked figures nothing can touch; fare passengers are not
physics or combat bodies.

**Tints.** The player's model keeps its multiply tint (`setClothes` works as before). A manifest
person's outfit is one atlas of coloured garments, where a multiply tint gave muddy colours (a
maroon T-shirt times khaki is brown-red), so tints on manifest people are a dye: the texel's
brightness times the colour. Every garment takes the colour, folds and patterns stay, hair and
shoes stay dark. Gangs keep their colours this way; people dressed for their role get no tint.

**Level of detail.** Animated figures beyond 30 m (2 m hysteresis) show the person's LOD1 and
cast no shadow. 30 m because at the phone's 60° view and 412 px height a 1.7 m person is about
20 px tall there, where a third of the triangles is not visible. LOD1 is the manifest's file,
bound to the same skeleton (one animation for both), or, without one, made at load time with
meshoptimizer's simplifier (35% of the triangles). Seated drivers and passengers are baked
from LOD1. Platform crowds stay baked instanced poses (TD-23), now one set per person.

**Cost** (`?quality=lite`, software GPU, worst of four headings, 915×412), placeholder model for
everyone (feat f4e22fe) → manifest people (fixture cast):

| Place | Before | After |
|---|---|---|
| Anna Nagar spawn | 207 draw calls, 300,560 triangles | 187, 258,365 |
| T. Nagar (3269, 4960) | 154, 270,314 | 124, 196,827 |
| Two-star police stop at spawn | 225, 316,265 | 200, 266,063 |
| Chennai Egmore platform (morning) | 153, 229,614 | 131, 164,524 |

**Tests.** `packages/player/src/people.test.ts` (parsing, casting, no children where they can
be hurt, LOD choice, height fit, stride), `retarget.test.ts` (feet kept on the ground),
`apps/game/tests/people.spec.ts` (several people on the street, drivers and police by role, LOD
by distance, feet on the ground). Debug: `window.__cow.people()`.
