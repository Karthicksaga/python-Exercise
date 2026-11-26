# Godot skills: where they come from

Vendored (copied as they were, not edited) on 23 Nov 2026 for the planned Godot version of the
Chennai game (`godot-chennai/`). Each folder keeps its own licence file. Reviewed before adding:
instructions and the two helper scripts (`godot-project-organization/scripts/audit_project.py`,
`godot-nodes-scenes/scripts/check_godot_project.py`) only read project files; nothing downloads,
runs other programs or touches credentials.

| Skill | Source repository (commit) | Licence |
|---|---|---|
| `godot-project-organization` | github.com/grndctrl/godot-skills (9cbc5ca) | MIT |
| `godot-gamedev` | github.com/setcodes/gamedev-skills (096c224) | MIT |
| `godot-3d-essentials`, `godot-animation`, `godot-physics`, `godot-gdscript`, `godot-gdscript-headless-testing`, `godot-export`, `godot-resources`, `godot-nodes-scenes`, `godot-shaders`, `godot-ui-control`, `godot-audio`, `godot-signals-groups` | github.com/gamedev-skills/awesome-gamedev-agent-skills (c6ca6c4), `skills/godot/` | Apache 2.0 (`LICENSE` and `NOTICE` copied into each folder) |
| `game-ui-ux`, `game-feel`, `camera-systems`, `level-design`, `procedural-gen`, `audio-design`, `performance-optimization`, `input-systems`, `physics-tuning` (engine-neutral design disciplines, added 23 Nov 2026 for the migration's design work; `godot-ui-control` already pointed to `game-ui-ux`) | github.com/gamedev-skills/awesome-gamedev-agent-skills (c6ca6c4), `skills/disciplines/` | Apache 2.0 (`LICENSE` and `NOTICE` copied into each folder) |
| `chennai-game-design` (art direction, HUD/menu rules, screenshot review for this game, with the Three.js version's lessons) | Written for this repository, 23 Nov 2026 | Same as the repository |

Not taken: 2D, tilemap, multiplayer and C# skills, the discipline `create-game-assets` (2D sprites, pixel art and tilesets; this game is 3D and its models come from Blender scripts), and the genre skills (the game is 3D, single-player, GDScript), and
setcodes' `blender-game-assets` (it bundles a Blender bridge server; the game already has its own
Blender build scripts in `chennai-open-world/tools/blender/`). The multi-engine collection's
router plugin was not installed; these skills are picked by their descriptions.

The collection's skills are written for Godot 4.7. To update a skill, copy the folder again from
its repository at a newer commit, read the changes, and update the commit in this table.
