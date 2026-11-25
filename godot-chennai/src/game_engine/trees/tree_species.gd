class_name TreeSpecies
extends RefCounted
## The tree kit's species (decision G-381): ids, kind, size and the numbers the planner, the
## models and the LOD swap read. Plain data, no nodes. Heights are the model's own height in metres
## before the per-instance scale (a tree's `scale` is about 1). Everything is estimated from how
## Chennai's trees look (owner photographs, `docs/trees.md`); nothing here is mapped by OSM.

## Kinds. Trees and palms stand solid (a collider box); bushes, grass, scrub and dead wood do not
## (a dead trunk still blocks).
const TREE := &"tree"
const PALM := &"palm"
const BUSH := &"bush"
const GRASS := &"grass"
const DEAD := &"dead"

## LOD indices: 0 the full model, 1 about a third of it, 2 a few cards (distant).
const LODS := 3

const NEEM := &"neem"
const RAIN := &"rain"
const BANYAN := &"banyan"
const TAMARIND := &"tamarind"
const GULMOHAR := &"gulmohar"
const COCONUT := &"coconut"
const PALMYRA := &"palmyra"
const MANGO := &"mango"
const PEEPAL := &"peepal"
const CASUARINA := &"casuarina"
const OLEANDER := &"oleander"
const BOUGAINVILLEA := &"bougainvillea"
const CROTON := &"croton"
const GRASS_TUFT := &"grass_tuft"
const SCRUB := &"scrub"
const DEAD_BARE := &"dead_bare"
const DEAD_SNAG := &"dead_snag"
const DEAD_PALM := &"dead_palm"

## Every species in a fixed order (the order of the models and of the draw calls).
const IDS: Array[StringName] = [
	NEEM, RAIN, BANYAN, TAMARIND, GULMOHAR, COCONUT, PALMYRA, MANGO, PEEPAL, CASUARINA,
	OLEANDER, BOUGAINVILLEA, CROTON, GRASS_TUFT, SCRUB, DEAD_BARE, DEAD_SNAG, DEAD_PALM,
]

## kind, height (m), crown width (m), trunk radius for the collider (m), sway (1 = a leafy tree),
## far (the distance beyond which it is not drawn at High, m), size jitter (+- share), caster.
const TABLE: Dictionary[StringName, Dictionary] = {
	NEEM: {"kind": TREE, "height": 11.0, "width": 9.0, "trunk": 0.32, "sway": 1.0, "far": 320.0, "jitter": 0.18},
	RAIN: {"kind": TREE, "height": 14.0, "width": 19.0, "trunk": 0.45, "sway": 0.8, "far": 340.0, "jitter": 0.18},
	BANYAN: {"kind": TREE, "height": 16.0, "width": 22.0, "trunk": 0.8, "sway": 0.5, "far": 340.0, "jitter": 0.15},
	TAMARIND: {"kind": TREE, "height": 13.0, "width": 10.0, "trunk": 0.42, "sway": 0.7, "far": 320.0, "jitter": 0.15},
	GULMOHAR: {"kind": TREE, "height": 8.5, "width": 11.0, "trunk": 0.3, "sway": 0.9, "far": 300.0, "jitter": 0.18},
	COCONUT: {"kind": PALM, "height": 12.0, "width": 8.0, "trunk": 0.22, "sway": 1.3, "far": 320.0, "jitter": 0.15},
	PALMYRA: {"kind": PALM, "height": 14.0, "width": 5.0, "trunk": 0.3, "sway": 0.6, "far": 320.0, "jitter": 0.15},
	MANGO: {"kind": TREE, "height": 10.0, "width": 11.5, "trunk": 0.4, "sway": 0.7, "far": 300.0, "jitter": 0.15},
	PEEPAL: {"kind": TREE, "height": 14.0, "width": 11.0, "trunk": 0.45, "sway": 1.2, "far": 320.0, "jitter": 0.15},
	CASUARINA: {"kind": TREE, "height": 15.0, "width": 5.0, "trunk": 0.22, "sway": 1.5, "far": 320.0, "jitter": 0.18},
	OLEANDER: {"kind": BUSH, "height": 2.6, "width": 2.4, "trunk": 0.0, "sway": 0.6, "far": 110.0, "jitter": 0.25},
	BOUGAINVILLEA: {"kind": BUSH, "height": 2.4, "width": 3.0, "trunk": 0.0, "sway": 0.4, "far": 110.0, "jitter": 0.25},
	CROTON: {"kind": BUSH, "height": 1.3, "width": 1.3, "trunk": 0.0, "sway": 0.3, "far": 90.0, "jitter": 0.25},
	GRASS_TUFT: {"kind": GRASS, "height": 0.8, "width": 1.2, "trunk": 0.0, "sway": 1.0, "far": 70.0, "jitter": 0.35},
	SCRUB: {"kind": GRASS, "height": 1.2, "width": 1.8, "trunk": 0.0, "sway": 0.5, "far": 90.0, "jitter": 0.3},
	DEAD_BARE: {"kind": DEAD, "height": 8.0, "width": 6.0, "trunk": 0.3, "sway": 0.1, "far": 260.0, "jitter": 0.15},
	DEAD_SNAG: {"kind": DEAD, "height": 5.5, "width": 3.0, "trunk": 0.3, "sway": 0.0, "far": 220.0, "jitter": 0.15},
	DEAD_PALM: {"kind": DEAD, "height": 9.0, "width": 4.0, "trunk": 0.22, "sway": 0.3, "far": 260.0, "jitter": 0.15},
}


static func kind_of(species: StringName) -> StringName:
	return (TABLE[species] as Dictionary)["kind"] if TABLE.has(species) else TREE


static func number(species: StringName, key: String) -> float:
	return float((TABLE[species] as Dictionary)[key])


## Trees, palms and dead wood count as "trees" for the density and the colliders; bushes and
## grass are the understory (a lower density on weak phones).
static func is_understory(species: StringName) -> bool:
	var k := kind_of(species)
	return k == BUSH or k == GRASS


static func solid(species: StringName) -> bool:
	return TABLE.has(species) and number(species, "trunk") > 0.0
