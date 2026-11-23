class_name PhysicsLayers
extends RefCounted
## Collision layer bits (decision G-76; physics-tuning "layer matrix as data"). Foundation and
## Player may rename them; the values are what the vehicle code uses.
##
## | Layer | Bit | Scans |
## |---|---|---|
## | world (ground, buildings, kerbs) | 1 | nothing (static) |
## | player (the walking capsule, a thrown rider) | 2 | world, vehicles |
## | vehicles (chassis boxes) | 3 | world, vehicles, player, people |
## | people (pedestrians) | 4 | world, vehicles |

const WORLD := 1 << 0
const PLAYER := 1 << 1
const VEHICLES := 1 << 2
const PEOPLE := 1 << 3
## What a wheel's ray can stand on: the ground and other vehicles' roofs.
const WHEEL_RAY := WORLD | VEHICLES
