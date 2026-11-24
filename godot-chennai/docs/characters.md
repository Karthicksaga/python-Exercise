# Characters: the Chennai cast in Godot

The people of the game are built by script from the owner's concept boards
(`docs/concept/characters/`): **phase 1, the 20 base characters** (`phase1-20-characters.webp`,
10 men and 10 women), and **phase 2** (`phase2-60-characters.webp`): the 20 play their matching
phase-2 figures and 50 new people play the rest, so **70 people (40 men, 30 women) cover all 74
figures** of the phase-2 board (two are couples). Every person is MakeHuman/MPFB (CC0) in Blender, dressed in recoloured
MakeHuman clothes and garments modelled in the script, rigged on one shared skeleton, with five
clips. Nothing is edited by hand: `tools/blender/characters.py` and `tools/blender/cast_people.py`
are the source. No real likenesses, no brands, logos, slogans, insignia, badges or school names.

## Files

| Path | What |
|---|---|
| `assets/people/<id>.glb` | One person: `Skeleton3D` (52 bones), meshes `Body` (LOD0) and `Body_LOD1`, materials `Skin` and `Outfit` (512 px WebP each), `AnimationPlayer` with `idle`, `walk`, `run`, `sit`, `talk` |
| `assets/people/people.json` | The manifest (below) |
| `assets/people/sole_plant.gd` | Run-time sole planting for clip blends (G-12) |
| `tools/blender/cast_people.py` | The cast: one `person(...)` per board figure (body, tone, face seed, hair, clothes, colours, board figure) |
| `tools/blender/characters.py` | The builder (copied from `chennai-open-world/tools/blender/characters.py`, which stays as it is, and extended) |
| `tools/blender/cast_animation.py` | Retargeting of idle/walk/run, the authored sit and talk, sole planting, baking |
| `tools/blender/optimize_people.py` | Blender GLB → game GLB (dedup, prune, resample, WebP) |
| `tools/build_people.sh` | Both steps: `tools/build_people.sh [--set phase1\|phase2] [--only id,id]` |
| `tools/run_people_tests.sh` | Headless tests, or review renders with `--lineup` |
| `tools/people_compare.py` | Side-by-side sheets: board figure next to the render |
| `tests/people/test_people.gd` | The tests; `people_gltf.gd` helpers; `people_lineup.gd` review renders |

## What a person file is

| | LOD0 `Body` | LOD1 `Body_LOD1` |
|---|---|---|
| Triangles | at most 10,000 (measured 7,200–9,971) | at most 3,500 (measured 3,340–3,391) |
| Body base | MakeHuman low-poly proxy (`male1591`, `female1605`) with clothes | the LOD0 parts decimated, eyelashes removed |
| Shown | nearer than 30 m | from 30 m |

Common to both: the skeleton (MPFB `mixamo`, 52 bones named `mixamorig_Hips`, `mixamorig_LeftArm`
… in Godot), at most four weights per vertex, rest pose MakeHuman's A-pose, metres, soles on the
ground at the origin, facing glTF +Z, MakeHuman targets baked (no blend shapes), skin hidden under
clothes deleted, **no vertex colours**, two materials (`Skin` opaque; `Outfit` atlas,
alpha-scissor for hair cards, double-sided).

Clips (30 fps, all loops, the last frame equals the first):

| Clip | Length | Source |
|---|---|---|
| `idle` | 2.5 s | Mixamo idle from `locomotion.glb`, retargeted, thighs 7° in |
| `walk` | 0.97 s | Mixamo walk, retargeted (in place) |
| `run` | 0.7 s | Mixamo run, retargeted (in place; soles planted, so no flight phase) |
| `sit` | 4 s | authored: seated on a seat at knee height, hands towards the thighs, breathing |
| `talk` | 5 s | authored: idle with right-hand beats, left hand, nods and a head turn |

The walk and run are in place: the game moves the body and should scale the playback speed with
the person's leg length (`heightM`), as the Three.js game did.

## Manifest (`assets/people/people.json`)

```json
{ "version": 1, "skeleton": "MPFB mixamo, 52 bones (Godot names mixamorig_<Bone>)",
  "people": [ { "id": "nurse", "file": "nurse.glb", "sex": "female", "age": "young", "years": 30,
    "child": false, "roles": ["healthcare", "pedestrian", "passenger"], "clothing": ["uniform"],
    "outfit": "white short-sleeved tunic and white trousers (no badge), …",
    "board": "docs/concept/characters/phase1-20-characters.webp", "figure": 16, "figureLabel": "Nurse",
    "alsoFigures": [{ "board": "…phase2-60-characters.webp", "figure": "healthcare-2", "figureLabel": "Nurse" }],
    "note": "", "heightM": 1.6, "seatHeightM": 0.4,
    "lods": [{ "mesh": "Body", "triangles": 9697, "until": 30.0 }, { "mesh": "Body_LOD1", "triangles": 3389, "from": 30.0 }],
    "texture": 512, "animations": ["idle", "walk", "run", "sit", "talk"],
    "licence": "…", "assets": ["skins/young_african_female", "…"] } ] }
```

- `age`: `child` (under 13), `teen` (13–19), `young` (20–35), `middle` (36–59), `elderly` (60+).
  `child` is also a boolean. **Children only get the roles `school`, `passenger`, `family`**
  (tested); the game must keep them out of anything that can be hit, shot or hurt (only station
  crowds and passengers with an adult, brief §6). Teens stay out of combat casting too.
- `roles`: pedestrian, auto-driver, cab-driver, bus-driver, bus-conductor, traffic-police,
  police, vendor, tea-worker, construction, delivery, shopkeeper, office, college, school,
  passenger, healthcare, security, sanitation, services, worker, family, traditional, temple,
  sport, tourist, homemaker, teacher, elderly.
- `clothing`: saree, veshti, lungi, salwar, chudidar, kurta, uniform, office, casual, work,
  school, sport, traditional.
- `board`/`figure`/`figureLabel`: the board figure this person is built from (phase 1: the
  number printed on the board; phase 2: `<group>-<position>` in reading order). `alsoFigures`:
  other figures the person also plays. `note`: what differs from the board on purpose.
- `heightM`: top of the head above the soles. `seatHeightM`: seat height for the `sit` clip.
- `assets`: the MakeHuman assets the person is made from (licences in `assets/LICENSES.md`).

## The cast

<!-- CAST TABLE -->
### Phase 1 (board `phase1-20-characters.webp`)

| id | board figure | also plays | sex / age | roles | outfit | LOD0 / LOD1 triangles | KB |
|---|---|---|---|---|---|---|---|
| `college-student-m` | 1 College Student | students-1 College Boy | male / young (20), 1.68 m | college, pedestrian, passenger | maroon long-sleeved top, blue jeans, white trainers, dark backpack, short beard | 9,695 / 3,386 | 809 |
| `it-professional-m` | 2 IT Professional | office-1 Software Engineer; families-8 Young Couple (man) | male / young (28), 1.83 m | office, pedestrian, passenger | light blue formal shirt, charcoal trousers, belt, blank ID card on a lanyard, black shoes, short beard | 9,696 / 3,387 | 778 |
| `delivery-rider` | 3 Delivery Rider | transport-5 Delivery Rider; transport-6 Logistics Rider | male / young (25), 1.79 m | delivery, pedestrian | plain teal riding jacket (board's branded orange replaced, no logo), black cargo trousers, grey trainers, dark backpack | 9,698 / 3,389 | 793 |
| `auto-driver` | 4 Auto Driver | transport-1 Auto Driver | male / middle (45), 1.75 m | auto-driver | khaki shirt and khaki trousers (the auto driver's dress), sandals, moustache | 9,279 / 3,389 | 753 |
| `shopkeeper-m` | 5 Shopkeeper | vendors-7 Petty Shop Owner | male / middle (48), 1.75 m | shopkeeper, vendor, pedestrian | blue-and-red checked shirt, white veshti with a gold border, cream towel on the shoulder, sandals, moustache | 9,698 / 3,387 | 781 |
| `police-constable` | 6 Police Constable | police-2 Police Constable; police-4 Home Guard | male / middle (42), 1.82 m | police, traffic-police | generic khaki uniform, dark red-brown belt, khaki peaked cap (no insignia, badges or shoulder marks), brown shoes, moustache | 9,697 / 3,391 | 807 |
| `construction-worker` | 7 Construction Worker | workers-1 Construction Worker | male / young (32), 1.78 m | construction, worker | purple T-shirt, plain orange hi-visibility vest with reflective bands, grey-olive cargo trousers, work boots, yellow hard hat | 9,648 / 3,340 | 787 |
| `office-employee-m` | 8 Office Employee | office-3 Office Executive | male / young (30), 1.82 m | office, pedestrian, passenger | pale lilac checked shirt, charcoal trousers, brown belt, blank ID card, brown shoes | 9,698 / 3,387 | 783 |
| `elderly-man` | 9 Elderly Man | elderly-1 Elderly Man (Veshti); traditional-1 Man (Veshti) | male / elderly (70), 1.71 m | pedestrian, passenger, elderly | pale pink shirt, white veshti with a gold border, sandals, white hair, white moustache and short beard | 9,698 / 3,390 | 782 |
| `tea-vendor` | 10 Street Vendor (Tea) | vendors-1 Tea Stall Owner | male / middle (46), 1.76 m | tea-worker, vendor | brown-and-red checked shirt, blue checked lungi to the ankle, red towel on the shoulder, sandals, salt-and-pepper beard | 8,503 / 3,388 | 783 |
| `college-student-f` | 11 College Student | students-2 College Girl | female / young (20), 1.52 m | college, pedestrian, passenger | plain white T-shirt (the board's slogan left out), blue jeans, trainers, long open hair, dark backpack | 9,697 / 3,389 | 846 |
| `it-professional-f` | 12 IT Professional | office-2 Product Analyst | female / young (27), 1.65 m | office, pedestrian, passenger | light blue shirt, dark brown trousers, belt, blank ID card on a lanyard, flat sandals, ponytail | 9,696 / 3,387 | 869 |
| `working-professional-f` | 13 Working Professional |  | female / young (32), 1.63 m | office, pedestrian, passenger | dark green calf-length kurta with fine dots, white leggings, blank ID card, sandals, plait, bindi | 7,800 / 3,388 | 807 |
| `homemaker` | 14 Homemaker |  | female / middle (42), 1.58 m | homemaker, pedestrian, passenger, family | mustard-yellow saree with a maroon and gold border, maroon blouse, plait, bindi, sandals | 8,250 / 3,387 | 818 |
| `shopkeeper-f` | 15 Shopkeeper |  | female / middle (40), 1.61 m | shopkeeper, vendor, pedestrian | rose-pink printed top, grey-and-black striped apron, jeans, sandals, plait | 9,104 / 3,382 | 849 |
| `nurse` | 16 Nurse | healthcare-2 Nurse | female / young (30), 1.63 m | healthcare, pedestrian, passenger | white short-sleeved tunic and white trousers (no badge), blank ID card, white shoes, hair in a bun | 9,697 / 3,388 | 861 |
| `school-girl` | 17 School Student | students-6 School Girl | female / child (12), 1.32 m **child** | school | generic uniform: light blue short-sleeved shirt, navy pinafore, white socks, black shoes, two plaits, dark backpack (no school name) | 9,695 / 3,384 | 857 |
| `elderly-woman` | 18 Elderly Woman | elderly-2 Elderly Woman (Saree) | female / elderly (68), 1.53 m | pedestrian, passenger, elderly | purple silk-look saree with a gold border, purple blouse, grey hair in a plait, sandals | 7,875 / 3,386 | 825 |
| `flower-vendor` | 19 Street Vendor (Flowers) | vendors-3 Flower Seller | female / middle (38), 1.59 m | vendor, pedestrian | green saree with a magenta and gold border, lime blouse, plait, bindi, sandals | 8,249 / 3,385 | 827 |
| `young-professional-f` | 20 Young Professional | families-8 Young Couple (woman) | female / young (25), 1.63 m | office, pedestrian, passenger | pink knee-length kurta with a fine print, white leggings, blank ID card, sandals, long open hair | 7,727 / 3,384 | 788 |

### Phase 2, new people (board `phase2-60-characters.webp`; the last ten added at the owner's request)

| id | board figure | also plays | sex / age | roles | outfit | LOD0 / LOD1 triangles | KB |
|---|---|---|---|---|---|---|---|
| `engineering-student` | students-3 Engineering Student |  | male / young (21), 1.67 m | college, pedestrian, passenger | beige shirt, blue jeans, dark backpack, blank ID card, trainers, beard | 9,696 / 3,385 | 788 |
| `school-boy` | students-5 School Boy |  | male / child (10), 1.31 m **child** | school, passenger | generic uniform: white shirt, navy trousers, black belt, black shoes, backpack (no school name) | 9,696 / 3,389 | 783 |
| `sports-student` | students-8 Student (Sports) |  | male / teen (16), 1.52 m | school, pedestrian, passenger | white polo shirt, navy track trousers, white trainers | 9,693 / 3,385 | 782 |
| `manager` | office-5 Manager |  | male / middle (46), 1.76 m | office, pedestrian, passenger | lavender formal shirt, charcoal trousers, belt, blank ID card, black shoes, moustache | 9,906 / 3,387 | 827 |
| `cab-driver` | transport-2 Cab Driver |  | male / middle (38), 1.77 m | cab-driver, pedestrian | cream shirt, grey trousers, brown shoes, moustache | 9,696 / 3,388 | 784 |
| `bus-driver` | transport-3 Bus Driver |  | male / middle (47), 1.77 m | bus-driver, pedestrian | generic light blue uniform shirt, navy trousers, belt, blank ID card, black shoes (no transport-corporation badge) | 9,697 / 3,388 | 782 |
| `bus-conductor` | transport-4 Bus Conductor |  | male / middle (41), 1.76 m | bus-conductor, pedestrian | generic light blue uniform shirt, navy trousers, belt, blank ID card, sandals, moustache and stubble | 7,394 / 3,388 | 739 |
| `fruit-vendor` | vendors-4 Fruit Vendor |  | male / middle (52), 1.74 m | vendor, pedestrian | khaki-brown shirt, dark green checked lungi to the knee, towel, sandals, short grey hair | 8,128 / 3,386 | 773 |
| `electrician` | workers-2 Electrician |  | male / young (34), 1.77 m | worker, services, pedestrian | khaki-brown work shirt, blue jeans, belt, work boots, moustache | 9,697 / 3,389 | 801 |
| `security-guard` | workers-6 Security Guard |  | male / middle (49), 1.77 m | security, pedestrian | generic light blue shirt, navy trousers, black belt, navy peaked cap (no badge or company name), black shoes | 9,697 / 3,390 | 806 |
| `traffic-police` | police-3 Traffic Police |  | male / middle (40), 1.82 m | traffic-police, police | generic white shirt, navy trousers, black belt, white peaked cap with a dark band (no insignia), black shoes | 9,698 / 3,390 | 807 |
| `police-inspector` | police-1 Police Inspector |  | male / middle (50), 1.81 m | police | generic khaki uniform, brown belt, darker khaki peaked cap (no insignia, badges or shoulder marks), black shoes, moustache | 9,696 / 3,388 | 806 |
| `middle-aged-man` | families-3 Middle-aged Man |  | male / middle (52), 1.76 m | pedestrian, passenger, family | cream half-sleeve-look shirt, dark grey trousers, sandals, grey moustache | 9,271 / 3,389 | 753 |
| `father` | families-5 Father | families-7 Parent (Kid) | male / middle (40), 1.78 m | pedestrian, passenger, family | white shirt, brown trousers, sandals, moustache | 9,271 / 3,388 | 752 |
| `retired-man` | elderly-3 Retired Man | elderly-5 Elderly Couple (man) | male / elderly (66), 1.74 m | pedestrian, passenger, elderly | light blue checked shirt, beige trousers, sandals, grey hair and moustache | 9,266 / 3,390 | 762 |
| `elderly-man-lungi` | elderly-6 Elderly Man (Walking Stick) |  | male / elderly (76), 1.70 m | pedestrian, passenger, elderly | striped beige shirt, maroon checked lungi to the ankle, towel on the shoulder, sandals, white hair and beard (no stick yet) | 8,514 / 3,387 | 794 |
| `teen-boy` | children-3 Teen Boy |  | male / teen (16), 1.56 m | pedestrian, passenger | navy polo shirt, blue jeans, trainers | 9,695 / 3,387 | 814 |
| `temple-goer-m` | traditional-3 Man (Temple Goer) |  | male / middle (58), 1.75 m | pedestrian, passenger, temple, traditional | white shirt, white veshti with a gold border, cream angavastram (towel) with a gold stripe, sandals, salt-and-pepper beard | 9,699 / 3,387 | 779 |
| `jogger` | lifestyle-1 Jogger | lifestyle-2 Gym Enthusiast | male / young (29), 1.82 m | pedestrian, sport | light blue T-shirt, navy shorts, white trainers | 9,920 / 3,387 | 810 |
| `tourist` | lifestyle-4 Tourist |  | male / young (33), 1.82 m | pedestrian, passenger, tourist | white shirt, blue jeans, dark backpack, trainers | 9,697 / 3,388 | 787 |
| `arts-student` | students-4 Arts Student |  | female / young (20), 1.51 m | college, pedestrian, passenger | coral T-shirt, blue jeans, blank ID card, trainers, long open hair | 9,697 / 3,387 | 837 |
| `student-backpack` | students-7 Student (Backpack) |  | female / teen (17), 1.44 m | school, pedestrian, passenger | white shirt, navy trousers, backpack, blank ID card, sandals, plait | 9,698 / 3,382 | 867 |
| `hr-professional` | office-4 HR Professional |  | female / middle (36), 1.61 m | office, pedestrian, passenger | soft pink cotton saree with a gold border, pink blouse, plait, bindi, sandals | 8,254 / 3,387 | 818 |
| `vegetable-vendor` | vendors-5 Vegetable Vendor |  | female / middle (44), 1.58 m | vendor, pedestrian | maroon saree with a green border, green blouse, plait, bindi, sandals | 8,252 / 3,386 | 827 |
| `facility-staff` | workers-8 Facility Staff |  | female / young (31), 1.62 m | services, worker, pedestrian | generic navy tunic over a white shirt, navy trousers, blank ID card, sandals, hair in a bun (no company name) | 8,193 / 3,388 | 815 |
| `health-worker` | healthcare-4 Health Worker |  | female / young (34), 1.62 m | healthcare, pedestrian, passenger | pink knee-length tunic and pink trousers (no badge), blank ID card, sandals, bun | 7,736 / 3,385 | 798 |
| `doctor-f` | healthcare-1 Doctor |  | female / middle (38), 1.63 m | healthcare, pedestrian, passenger | white knee-length coat over blue trousers, blank ID card, shoes, bun (the board draws this figure as a man; cast as a woman for the board's 30 + 30 split (kept by the owner, 23 Nov 2026)) | 9,696 / 3,386 | 855 |
| `teacher-f` | office-7 Teacher | office-8 Lecturer | female / middle (42), 1.60 m | teacher, pedestrian, passenger | pale green cotton saree with a maroon border, maroon blouse, plait, bindi, sandals (the board draws this figure as a man; cast as a woman for the board's 30 + 30 split (kept by the owner, 23 Nov 2026)) | 8,254 / 3,386 | 820 |
| `bank-employee-f` | office-6 Bank Employee |  | female / young (29), 1.63 m | office, pedestrian, passenger | blue calf-length kurta, white leggings, white dupatta, blank ID card, sandals, plait (the board draws this figure as a man; cast as a woman for the board's 30 + 30 split (kept by the owner, 23 Nov 2026)) | 8,016 / 3,384 | 808 |
| `sanitation-worker-f` | workers-4 Sanitation Worker | workers-5 Municipal Worker | female / middle (39), 1.59 m | sanitation, worker, services | faded green saree, plain orange hi-visibility vest with reflective bands, head cloth, sandals (the board draws this figure as a man; cast as a woman for the board's 30 + 30 split (kept by the owner, 23 Nov 2026)) | 8,571 / 3,383 | 833 |
| `young-woman` | families-2 Young Woman |  | female / young (26), 1.65 m | pedestrian, passenger, office | beige shirt, beige trousers, blank ID card, sandals, long open hair | 9,696 / 3,385 | 848 |
| `middle-aged-woman` | families-4 Middle-aged Woman |  | female / middle (50), 1.58 m | pedestrian, passenger, family | lilac saree with a pink and gold border, lilac blouse, plait, bindi, sandals | 8,244 / 3,384 | 826 |
| `mother` | families-6 Mother |  | female / young (34), 1.62 m | pedestrian, passenger, family, homemaker | orange saree with a maroon border, maroon blouse, plait, bindi, sandals | 8,250 / 3,386 | 823 |
| `retired-woman` | elderly-4 Retired Woman |  | female / elderly (66), 1.55 m | pedestrian, passenger, elderly | cream cotton saree with a gold border, cream blouse, grey hair in a plait, sandals | 7,869 / 3,388 | 812 |
| `elderly-woman-blue` | elderly-5 Elderly Couple (woman) |  | female / elderly (72), 1.53 m | pedestrian, passenger, elderly | slate blue saree with a maroon border, blue blouse, grey hair in a plait, sandals | 7,878 / 3,387 | 819 |
| `girl-8-10` | children-2 Girl (8-10) |  | female / child (9), 1.17 m **child** | passenger, family | white top with pink sleeves, pink knee-length skirt, sandals, plait | 7,200 / 3,390 | 771 |
| `teen-girl` | children-4 Teen Girl |  | female / teen (15), 1.38 m | school, pedestrian, passenger | generic uniform: white shirt, navy knee-length skirt, white socks, black shoes, backpack, blank ID card (no school name) | 9,695 / 3,387 | 862 |
| `girl-cycle` | children-6 Girl (Cycle) |  | female / child (12), 1.32 m **child** | passenger, family | lilac T-shirt, pink leggings, sandals, plait (no bicycle yet) | 8,498 / 3,383 | 812 |
| `woman-traditional` | traditional-2 Woman (Traditional) |  | female / middle (40), 1.60 m | pedestrian, passenger, traditional | red silk-look saree with a mustard and gold border, mustard blouse, plait, bindi, sandals | 8,253 / 3,384 | 830 |
| `temple-goer-f` | traditional-4 Woman (Temple Goer) |  | female / middle (46), 1.59 m | pedestrian, passenger, temple, traditional | mustard-orange saree with a green border, green blouse, plait, bindi, sandals | 8,247 / 3,389 | 820 |
| `tiffin-vendor` | vendors-2 Tiffin Vendor |  | male / middle (38), 1.77 m | vendor, pedestrian | white half-sleeved shirt, grey trousers, belt, sandals, moustache (no tiffin carrier yet) | 9,329 / 3,388 | 764 |
| `street-shop-owner` | vendors-6 Street Shop Owner |  | male / middle (46), 1.77 m | shopkeeper, vendor, pedestrian | light blue half-sleeved shirt with pockets, beige trousers, sandals, moustache | 9,280 / 3,388 | 754 |
| `baker` | vendors-8 Baker |  | male / middle (40), 1.77 m | shopkeeper, vendor, worker | white shirt, brown apron, plain white chef's cap, dark trousers, black shoes, short beard | 9,696 / 3,384 | 783 |
| `plumber` | workers-3 Plumber |  | male / middle (36), 1.77 m | worker, services, pedestrian | blue denim work shirt with pockets, dark trousers, belt, work boots, moustache | 9,971 / 3,390 | 843 |
| `office-assistant` | workers-7 Office Assistant |  | male / young (31), 1.78 m | office, services, pedestrian, passenger | pale grey half-sleeved shirt with pockets, charcoal trousers, belt, blank ID card, black shoes | 9,696 / 3,390 | 783 |
| `pharmacist` | healthcare-3 Pharmacist |  | male / young (32), 1.79 m | healthcare, pedestrian, passenger | white knee-length coat over navy trousers, blank ID card, black shoes, short beard | 9,689 / 3,383 | 777 |
| `young-man` | families-1 Young Man |  | male / young (27), 1.82 m | pedestrian, passenger, family | lilac long-sleeved shirt, blue jeans, belt, brown shoes, short beard | 9,696 / 3,390 | 817 |
| `boy-8-10` | children-1 Boy (8-10) |  | male / child (9), 1.24 m **child** | passenger, family | blue-and-white striped T-shirt, denim shorts, trainers (a child: only as a passenger with an adult or in a family group, never on a street or anywhere he can be hurt) | 9,695 / 3,388 | 766 |
| `playful-boy` | children-5 Playful Boy (Cricket) |  | male / child (10), 1.31 m **child** | family, play | light blue T-shirt, denim shorts, trainers (no bat yet) (a child: role `play` means the game may show him playing cricket only inside a safe play area (a park, a beach, a school ground) with no traffic, vehicles, police or fights; otherwise only with his family) | 9,552 / 3,389 | 794 |
| `cyclist` | lifestyle-3 Cyclist |  | male / young (30), 1.79 m | pedestrian, sport | blue T-shirt, navy shorts, trainers, small backpack (no bicycle yet) | 9,696 / 3,386 | 809 |

70 people (40 men, 30 women), LOD0 7,200–9,971 triangles, LOD1 3,340–3,391, textures 512 px, 57.7 MB of GLB in all (about 805 KB each). Children: `school-girl`, `school-boy`, `girl-8-10`, `girl-cycle`, `boy-8-10`, `playful-boy`.

### Owner decisions (23 Nov 2026)
- The four phase-2 figures drawn as men but cast as women (Doctor, Teacher, Bank Employee,
  Sanitation Worker) **stay women**; their manifest `note` says so.
- The ten figures first left out (Tiffin Vendor, Street Shop Owner, Baker, Plumber, Office
  Assistant, Pharmacist, Young Man, Boy (8–10), Playful Boy (Cricket), Cyclist) were built in the
  same round, so every board figure is played. The two boys are children (`child: true`). The
  cricket boy has the role `play`: the game may show him playing only inside a safe play area (a
  park, a beach or a school ground with no traffic, vehicles, police or fights), otherwise only
  with his family; the boy (8–10) only as a passenger or in a family group.

### Differences from the boards, on purpose
- Logos and brands: the delivery riders' branded orange (phase 1 fig. 3) and red (phase 2) become
  a plain teal jacket; T-shirt slogans (phase 1 fig. 11) become plain colours; MakeHuman's printed
  logo on its T-shirts is painted out.
- No police insignia, shoulder marks, name plates or badges; caps are plain. No school names or
  crests; ID cards are blank; no transport-corporation or company badges.
- Four phase-2 figures drawn as men are cast as women (the board's heading says 30 + 30; the owner
  kept them): Doctor, Teacher (also plays Lecturer), Bank Employee, Sanitation Worker (also plays
  Municipal Worker).
- Props are not modelled yet: helmet, bags, tea can, flower basket, fruit and vegetable trays,
  camera, walking stick, bicycle, cricket bat, tiffin carrier, glasses, watches.

## How the clothes are made
As in the Three.js version (see `chennai-open-world/docs/characters.md`): MakeHuman garments
recoloured (folds kept, prints flattened, logos painted out); tubes for wrapped cloth (veshti,
lungi, saree skirt, kurta and tunic skirts, school skirts, the apron's front); skin-tight pieces
cut from the body's own surface (blouse, pallu, kurta top, leggings, dupatta, towel, head cloth,
school shirt, pinafore); small hard pieces (caps, hard hat, belt, ID card, sandals). New here:
- **Hi-visibility vest** (plain orange, two reflective bands, no lettering), **apron** (striped bib
  and front skirt), **socks**, **backpack** (a rounded box on the back with two shoulder straps,
  no logo).
- **Half sleeves** where the board shows them (most men's shirts and every uniform shirt): the
  shirt is cut a little above the elbow by the bones that move it, the forearm skin kept.
  Office shirts stay long-sleeved. MakeHuman's bulky shirt sleeves are pulled in towards the arm.
- **Chest pockets with flaps** on uniform shirts (auto driver, police, bus crew, security, cab
  driver, plumber, office assistant, shop owner): plain, no badges.
- **Plaid** shirts (two colours of bands, as on the boards' shopkeeper, tea vendor, retired man).
- **Chef's cap** (baker), plain white.
- **Saree:** front pleats (folds in the skirt and their shading), the pallu band over the left
  shoulder plus a hanging end down the back to the thighs; long hems keep part of the hips'
  motion so they don't swing out like a bell when running.
- Kurtas and tunics fall straight from the hips (no A-line flare), side slits from mid-thigh.
- Pieces cut from the body over a MakeHuman shirt (towel, vest, straps) keep the skin under that
  shirt so they have a surface to be made from.
- Wrapped cloth gets a larger atlas tile (256 px of the 512 px atlas) for its border and motifs.

## Rebuilding
1. Blender 5.2 LTS and MPFB 2.0.18. The Blender extensions site was not reachable from the cloud
   container, so MPFB was built from its tagged source:
   `git clone --depth 1 --branch v2.0.18 https://github.com/makehumancommunity/mpfb2`, zip the
   `src/mpfb` folder, `blender -b --command extension install-file -r user_default -e <zip>`.
2. Unzip `makehuman_system_assets_cc0.zip`, `shirts01_cc0.zip` and `pants01_cc0.zip` (pages and
   hashes in `assets/LICENSES.md`) into MPFB's data folder
   (`~/.config/blender/5.2/extensions/.user/user_default/mpfb/data`; in the cloud container it is a
   link to `/opt/tools/mpfb-data`). Nothing of this is committed.
3. `tools/build_people.sh` (all 70, about 25 minutes on 4 cores), or `--set phase1`, or
   `--only id,id`. Needs Node.js for `npx @gltf-transform/cli@4.5.0`. It ends with a Godot import,
   `tools/blender/people_import.py` (sets the five clips to loop in each `.glb.import`) and a
   second import; commit the `.glb.import` files with the GLBs.
4. `./run_tests.sh --filter=people/` or `tools/run_people_tests.sh` (the tests, in Foundation's
   runner), `tools/run_people_tests.sh --lineup -- --anim walk --time 0.3 --out /tmp/walk.png`
   (review render), `python3 tools/people_compare.py /tmp/compare` (board side by side). Keep
   renders out of the repository.

To change a person, edit `cast_people.py`; new garments go in the GARMENT BUILDERS section of
`characters.py`.

## Using them in the game (for whoever wires them)
- Load with `ResourceLoader.load_threaded_request` (imported scenes) or `GLTFDocument` off the
  main thread; instance once per person, share the materials.
- LOD: set `visibility_range_end = 30` (+ `visibility_range_end_margin = 2`) on `Body` and
  `visibility_range_begin = 30` on `Body_LOD1`; no shadows from LOD1.
- The five clips already loop (`settings/loop_mode` in each `.glb.import`). Drive them with an
  `AnimationTree` (blend times ~0.2 s) and call `SolePlant.apply()` after it.
- Children: never spawn as pedestrians, enemies, drivers or targets (`child`, `age`).

## Known limits
- Faces are MakeHuman faces at 512 px with seeded variation: they read as South Indian at street
  distance but look alike and doll-like close up; women's faces are a little heavy.
- White and very light shirts look washed out under strong light (the recolour keeps fold shading
  above the base colour).
- Sarees are a skirt tube with pleats, a pallu band over the shoulder and a hanging end at the
  back, not a simulated drape; dupattas and towels are flat bands.
- Long tubes (saree, veshti, ankle lungi) can let the back shin through the hem when running.
- No props yet (helmet, bags, tea can, flower basket, trays, camera, walking stick, bicycle,
  cricket bat, tiffin carrier). No glasses (MakeHuman has none under CC0 in these packs).
- Sleeve hems are the cut edge of the MakeHuman shirt (slightly ragged up close).
- The run is planted, so it has no flight phase.
- idle/walk/run are Mixamo clips (Adobe terms; see `assets/LICENSES.md`).
