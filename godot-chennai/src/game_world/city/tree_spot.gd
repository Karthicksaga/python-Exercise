class_name TreeSpot
extends RefCounted
## One planted plant (G-383): where, which species and how it looks. Plain data made by
## `TreePlan` and drawn by `TreeBatch`.

## World metres (+X east, -Z north; a point of the map, like `WorldTree.position`).
var position: Vector2 = Vector2.ZERO
var species: StringName = TreeSpecies.NEEM
## Size multiplier around 1.
var scale: float = 1.0
var yaw: float = 0.0
## Lean: the horizontal direction it leans towards (unit, or zero) and the angle in radians.
var lean_dir: Vector2 = Vector2.ZERO
var lean: float = 0.0
## Per-instance colour multiplier (the MultiMesh colour).
var tint: Color = Color.WHITE
## 0..1 from the position's hash; a quality preset keeps the instances whose rank is under its share.
var rank: float = 0.0
## True for the trees the chunk file or a mapped tree row carried, false for plants added around them.
var from_data: bool = true
