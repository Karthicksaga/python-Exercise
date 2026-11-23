# Character concept boards

Reference boards from the project owner (23 Nov 2026) for the people of the Godot version. They
show the intended cast, its breadth and the realistic South Indian look. They are concept
references, not assets: nothing here is loaded by the game.

| File | What it shows |
|---|---|
| `phase1-20-characters.webp` | Phase 1: 20 base characters, 10 men and 10 women (college students, IT and office workers, delivery rider, auto driver, shopkeepers, police constable, construction worker, elderly man and woman, tea and flower vendors, homemaker, nurse, school student, young professional) |
| `phase2-24-characters.webp` | Phase 2 first set: 24 characters, 12 men and 12 women (adds software engineer, bus conductor, businessman, school teacher, young mother with child, traditional woman, teenager) |
| `phase2-60-characters.webp` | Phase 2 full set: 60 characters (30 + 30) in groups: students, IT and office professionals, drivers and transport, vendors and shopkeepers, workers and services, police and public safety, healthcare, families and adults, elderly, children and teens, traditional and cultural, lifestyle |
| `phase3-4-library-plan.webp` | Phase 3: 120 unique base characters by age and role; phase 4: 200-300 variants from modular clothing, hairstyles and accessories; each rigged with idle, walk, run, sit and talk; GLB for Android |

## Rules when building from these boards
- **Original content only (TD-18 of `chennai-open-world`).** Some boards show real brands: a
  "zomato" jacket and an orange food-delivery outfit with a logo, printed T-shirt slogans. In the
  game these become plain, invented colours with no logos or brand text. No real school names,
  police insignia or company badges.
- **No real people's likenesses.** The faces are illustrations; the game's people are generated
  (MakeHuman/MPFB in Blender, CC0), so no face is copied from a photo.
- **Children** may appear only where nothing can hurt them (station crowds, with an adult as
  passengers), as in the current game (`docs/characters.md` of `chennai-open-world`).
- The current game already has 37 people built this way (`chennai-open-world/assets/models/people/`,
  `people.json`); start from them and its Blender script, `tools/blender/characters.py`.
