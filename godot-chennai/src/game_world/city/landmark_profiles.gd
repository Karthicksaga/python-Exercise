class_name LandmarkProfiles
extends RefCounted
## Proportions of the landmark models, shared by their meshes (`LandmarkMeshes`) and their
## collision (`landmark_solids`) so what you see is what you bump into (`landmarks.ts`). Invented
## to suit the estimated height and level count: estimated, not surveyed.


static func _r(v: float) -> float:
	return CityHash.js_round(v * 100.0) / 100.0


## Anna Nagar Tower (`towerProfile`): steps (radius, top), drum, shaft, levels (y, radius), canopy.
static func tower(mark: Landmark) -> Dictionary:
	var footprint := mark.radius if mark.radius > 0.0 else 9.5
	var height := mark.height if mark.height > 0.0 else 41.0
	var count := maxi(2, mark.levels if mark.levels > 0 else 12)
	var rise := 0.18
	var steps: Array[Vector2] = []
	for i in 3:
		steps.append(Vector2(_r(footprint - i * 0.8), _r(rise * (i + 1))))
	var plinth_top := steps[2].y
	var scale := clampf(footprint / 9.5, 0.5, 1.35)
	var drum := Vector2(_r(4.4 * scale), _r(plinth_top + 4.2))
	var canopy_top := height - 1.6
	var canopy_bottom := canopy_top - 1.8
	var first := drum.y + 2.2
	var last := canopy_bottom - 2.2
	var levels: Array[Vector2] = []
	for i in count:
		var t := float(i) / (count - 1)
		levels.append(Vector2(_r(first + (last - first) * t), _r((3.9 - 0.6 * t) * scale)))
	return {
		"steps": steps,
		"drum": drum,
		"shaft": Vector2(_r(2.3 * scale), _r(canopy_bottom)),
		"levels": levels,
		"canopy": Vector3(_r(canopy_bottom), _r(canopy_top), _r(4.3 * scale)),
		"height": height,
	}


## A temple gateway tower (`gopuramProfile`). Tiers are Dictionaries with bottom, top, hx0, hx1,
## hz0, hz1 (x east-west, the depth; z the broad face).
static func gopuram(mark: Landmark) -> Dictionary:
	var height := mark.height if mark.height > 0.0 else 37.0
	var count := maxi(3, mark.levels if mark.levels > 0 else 7)
	var s := height / 37.0
	var hz := _r(11.0 * s)
	var hx := _r(7.0 * s)
	var base_top := _r(7.5 * s)
	var vault_height := _r(3.6 * s)
	var tiers_top := height - vault_height - 1.2 * s
	var rise := (tiers_top - base_top) / count
	var tiers: Array[Dictionary] = []
	for i in count:
		var t0 := float(i) / count
		var t1 := float(i + 1) / count
		tiers.append({
			"bottom": _r(base_top + rise * i), "top": _r(base_top + rise * (i + 1)),
			"hx0": _r(hx * (0.92 - 0.52 * t0)), "hx1": _r(hx * (0.92 - 0.52 * t1)) + 0.15,
			"hz0": _r(hz * (0.94 - 0.5 * t0)), "hz1": _r(hz * (0.94 - 0.5 * t1)) + 0.15,
		})
	var last := tiers[tiers.size() - 1]
	return {
		"base": {"bottom": 0.0, "top": base_top, "hx0": hx, "hx1": hx, "hz0": hz, "hz1": hz},
		"passage": Vector2(_r(2.0 * s), _r(5.2 * s)),
		"tiers": tiers,
		"vault": {"bottom": last["top"], "top": _r(float(last["top"]) + vault_height), "hx": last["hx1"], "hz": last["hz1"]},
		"finials": 7,
		"height": height,
	}
