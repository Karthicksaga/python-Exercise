class_name PhysicsLayers
extends RefCounted
## Collision layer bits, as decided by the Player agent (G-64; the constants also live on
## `PlayerController`). The vehicle code uses these (G-76).
##
## | Layer | Bit value | Scans |
## |---|---|---|
## | world (ground, buildings, kerbs, poles) | 1 | nothing (static) |
## | player (the walking body, a thrown rider) | 2 | world, people, vehicles |
## | people (pedestrians) | 4 | world, vehicles |
## | vehicles (chassis boxes) | 8 | world, vehicles, player, people |

const WORLD := 1
const PLAYER := 2
const PEOPLE := 4
const VEHICLES := 8
## What a wheel's ray can stand on: the ground and other vehicles' roofs.
const WHEEL_RAY := WORLD | VEHICLES
