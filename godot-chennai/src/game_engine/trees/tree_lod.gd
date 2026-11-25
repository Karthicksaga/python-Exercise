class_name TreeLod
extends RefCounted
## Which LOD an instance shows at a distance (G-385): a pure function, so the thresholds, the
## hysteresis and the "no flicker at an edge" rule are unit tests. -1 is "not drawn".

const HIDDEN := -1


## `current` is the LOD the instance has now (HIDDEN or 0..2); a threshold is crossed only
## when the distance passes it by `hyst`, so an instance standing on an edge does not flip each check.
static func pick(distance: float, current: int, t0: float, t1: float, far: float, hyst: float) -> int:
	var h := hyst
	# Going further away needs to pass the edge by h; coming closer needs to be inside it by h.
	match current:
		0:
			if distance <= t0 + h:
				return 0
			return 1 if distance <= t1 + h else (2 if distance <= far + h else HIDDEN)
		1:
			if distance < t0 - h:
				return 0
			if distance <= t1 + h:
				return 1
			return 2 if distance <= far + h else HIDDEN
		2:
			if distance < t1 - h:
				return 0 if distance < t0 - h else 1
			return 2 if distance <= far + h else HIDDEN
		_:
			if distance > far - h:
				return HIDDEN
			if distance < t0 - h:
				return 0
			return 1 if distance < t1 - h else 2


## The draw-call rule (at most two meshes per species per chunk): when all three LODs are in use at
## once, the farthest instances take the middle mesh. Returns the counts after the rule.
static func limit_meshes(counts: PackedInt32Array) -> PackedInt32Array:
	var out := counts.duplicate()
	if out[0] > 0 and out[1] > 0 and out[2] > 0:
		out[1] += out[2]
		out[2] = 0
	return out
