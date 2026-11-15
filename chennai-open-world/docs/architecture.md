# Architecture

## Overview

```
┌──────────────── Android APK ─────────────────┐
│ apps/mobile  (React Native shell)            │
│   MainMenu ── Play ──► GameScreen (WebView)  │
│   lifecycle, Back button, landscape,         │
│   full screen            ▲ postMessage       │
│                          ▼ cow-shell event   │
│ ┌──────── assets/game (built apps/game) ───┐ │
│ │ Game.ts  (composition root)              │ │
│ │  ├ @cow/game-world  chunk data, solids   │ │
│ │  ├ @cow/map-data    lat/lng ⇄ metres     │ │
│ │  ├ @cow/game-engine renderer, camera,    │ │
│ │  │                  loop, chunk meshes   │ │
│ │  ├ @cow/physics     Rapier wrapper       │ │
│ │  ├ @cow/player      movement, avatar     │ │
│ │  └ @cow/ui          joystick, HUD        │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Why the game runs in a WebView: `docs/technical-decisions.md`, TD-1.

## Packages and their rules

| Package | Owns | May import |
|---|---|---|
| `map-data` | Geographic projection; OSM extract → features in metres | nothing |
| `game-world` | `WorldMap` data model, OSM features → world (`buildWorldMap`), solids, road geometry helpers | `map-data` |
| `physics` | The only code that imports Rapier: static groups, character, vehicles, kinematic boxes | Rapier |
| `game-engine` | Scene and lighting, map and chunk meshes, chunk streaming, follow camera, beacon, fixed-step loop | `three`, `game-world`, `physics` (camera ray) |
| `player` | Movement rules (`PlayerController`), animated humans (`HumanAssets`, `HumanFigure`), animation retargeting | `three`, `physics` |
| `vehicles` | Vehicle types, procedural models, `Vehicle` (player-drivable), `TrafficCar` (AI-driven view) | `three`, `physics` |
| `ai` | Road graph, road-following agents, traffic and pedestrian presets. Pure logic | `game-world` |
| `missions` | Mission data types and `MissionRunner`. Pure logic | nothing |
| `combat` | Health, ammunition, punches, shots, enemy behaviour. Pure logic; asks the game two questions about the world | nothing |
| `audio` | Synthesised sound effects (Web Audio) | nothing |
| `ui` | Touch controls, HUD, minimap (DOM and 2D canvas) | nothing |
| `apps/game` | Wires the packages (`Game.ts`), content placed on the map (`content.ts`), AI bodies and models (`Population.ts`), enemy bodies and tracers (`Fighters.ts`), keyboard fallback, native bridge | all packages |
| `apps/mobile` | React Native shell | none of the above; loads the built bundle |

Dependency direction is one way: data → physics/rendering → gameplay → app. `game-world`,
`map-data`, `ai`, `missions` and `combat` must stay free of Three.js and Rapier types.

## Frame

1. `GameLoop` accumulates real time and runs `fixedUpdate` in 1/60 s steps (max 5 per frame).
2. `fixedUpdate`: read controls → get in or out → player or vehicle controls → every vehicle's
   wheels → AI agents (decide, then move their kinematic boxes) → combat (place the enemies the
   objective calls for, the player's attacks, the enemies' turn) → `PhysicsWorld.step` → missions.
3. `frame`: camera drag → place vehicles, rider or avatar → camera (ray cast so walls don't
   hide the player; trails behind a moving vehicle) → objective beacon, HUD, minimap → AI
   models → chunk streaming → shadows → render.

## Build pipeline

```
assets/osm/*.osm.json ──(npm run build:world)──► apps/game/src/generated/anna-nagar.json
packages + assets ──(npm run build)──► apps/game/dist (one script) ──(sync:android)──► APK assets
```

## Coordinates

Metres. +X east, +Y up, -Z north. Yaw 0 faces north; positive yaw turns left (west).
Chunk origin is a real latitude/longitude (`ANNA_NAGAR_ORIGIN`, 13.0850 N, 80.2101 E).

## Shell ⇄ game messages

Game → shell (`window.ReactNativeWebView.postMessage`, JSON): `ready {gpu}`, `error {message}`,
`paused {paused}`, `exit`. Shell → game (`cow-shell` CustomEvent, JSON detail): `pause`,
`resume`. Types in `apps/game/src/nativeBridge.ts` and `apps/mobile/src/GameScreen.tsx`; keep
the two in step.

## World streaming

The map is a grid of 250 m chunks holding buildings and trees. `ChunkManager` loads chunks
whose nearest edge is within 260 m of the player (one per frame, all at once after a teleport)
and frees those beyond 340 m. A chunk's collision (`chunkSolids` → one static group) is added
and removed with its meshes. Roads, parks and the ground are light and always loaded. Adding a
neighbourhood means a bigger extract and more chunks; nothing else changes. Chunk data is
still bundled in the script; streaming it from files needs TD-3's asset loader.
