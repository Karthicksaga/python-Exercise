class_name TreeQuality
extends RefCounted
## The quality preset's numbers for trees (G-386), kept in static variables because every chunk's
## `TreeBatch` reads them and a preset change must reach chunks already built. `PerfWiring.apply`
## calls `apply(values)`; `generation` goes up each time something changed, so a batch re-sorts its
## instances at its next check. Defaults are High (what tests and tools measure).

## Share of trees, palms and dead wood kept (an instance with `rank` at or above it is not drawn).
static var density: float = 1.0
## Share of bushes, grass tufts and scrub kept.
static var understory: float = 1.0
## Distances (m) where LOD 0 gives way to LOD 1, LOD 1 to LOD 2, and the farthest anything is drawn.
static var lod0: float = 45.0
static var lod1: float = 140.0
static var far: float = 340.0
## Wind in the vertex shader (off on Low).
static var sway: bool = true
## Only LOD 0 casts a shadow, and only on High.
static var shadows: bool = true
static var generation: int = 0

## Metres a tree must cross a threshold by before it changes LOD again (no flicker at the edge).
const HYSTERESIS := 3.0


static func apply(v: Dictionary) -> void:
	density = float(v["tree_density"])
	understory = float(v["scrub_density"])
	lod0 = float(v["tree_lod0"])
	lod1 = float(v["tree_lod1"])
	far = float(v["tree_far"])
	sway = bool(v["tree_sway"])
	shadows = bool(v["tree_shadows"])
	generation += 1


## The share kept for a species: bushes and grass use the understory number.
static func kept(species: StringName) -> float:
	return understory if TreeSpecies.is_understory(species) else density


## How far a species is drawn: its own limit, no more than the preset's.
static func far_of(species: StringName) -> float:
	var own := TreeSpecies.number(species, "far")
	return minf(own, far) if not TreeSpecies.is_understory(species) else minf(own, far * 0.45)


static func reset() -> void:
	density = 1.0
	understory = 1.0
	lod0 = 45.0
	lod1 = 140.0
	far = 340.0
	sway = true
	shadows = true
	generation += 1
