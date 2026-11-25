class_name TreeModels
extends RefCounted
## The tree kit's models (G-381): eighteen species, three LODs each, built in code from leaf
## cards on the one atlas (`TreeAtlas`) and a few tapered tubes for trunks and limbs. Plain packed
## arrays (`MeshBuilder`), so the whole kit builds on a worker thread; `TreeKit` commits it.
##
## Vertex data the shader reads (`trees.gdshader`):
## - UV.x = u + 2 * sway level (0..8): how much wind moves the vertex (trunk 0, leaf tips 8);
## - vertex colour = the species' leaf or bark tint times a baked light (darker low and inside);
## - the normal of a leaf card points away from the crown's centre, so a crown shades like a ball.
## Every model stands on y = 0 at x = z = 0 and faces nowhere in particular (the instance's yaw
## turns it). Triangle budgets per LOD are in `BUDGET` (the budget test holds them).

## Triangles a model may have at each LOD, by kind.
const BUDGET: Dictionary[StringName, Array] = {
	&"tree": [330, 110, 36],
	&"palm": [300, 110, 36],
	&"bush": [90, 36, 12],
	&"grass": [30, 14, 6],
	&"dead": [220, 70, 24],
}

const BARK := &"bark"
const UP := Vector3.UP

var atlas: TreeAtlas
## species -> three MeshBuilders (index = LOD).
var models: Dictionary[StringName, Array] = {}
var _rng := RandomNumberGenerator.new()


static func create(tree_atlas: TreeAtlas) -> TreeModels:
	var m := TreeModels.new()
	m.atlas = tree_atlas
	for id in TreeSpecies.IDS:
		var lods: Array[MeshBuilder] = []
		for lod in TreeSpecies.LODS:
			var b := MeshBuilder.new()
			m._build(b, id, lod)
			lods.append(b)
		m.models[id] = lods
	return m


func builder(species: StringName, lod: int) -> MeshBuilder:
	return (models[species] as Array)[lod] as MeshBuilder


func triangles(species: StringName, lod: int) -> int:
	return builder(species, lod).triangle_count()


# ---------------------------------------------------------------------------------------------
# Parts

func _lvl(y: float, h: float, weight: float) -> int:
	return clampi(roundi(weight * pow(clampf(y / maxf(h, 0.01), 0.0, 1.0), 1.4) * 8.0), 0, 8)


## A two-sided leaf card centred on `c`, `right` and `up` unit vectors along its sides, half sizes
## hw and hh, normal `n` (shading only).
func _card(b: MeshBuilder, tile: StringName, c: Vector3, right: Vector3, up: Vector3, hw: float, hh: float, col: Color, n: Vector3, level: int) -> void:
	var r := atlas.uv(tile)
	var off := 2.0 * float(level)
	var x0 := r.position.x + off
	var x1 := r.end.x + off
	var y0 := r.position.y
	var y1 := r.end.y
	var a := b.vertex(c - right * hw - up * hh, n, Vector2(x0, y1), col)
	var bb := b.vertex(c + right * hw - up * hh, n, Vector2(x1, y1), col)
	var cc := b.vertex(c + right * hw + up * hh, n, Vector2(x1, y0), col)
	var d := b.vertex(c - right * hw + up * hh, n, Vector2(x0, y0), col)
	b.quad(a, bb, cc, d)


## A card standing upright at the origin turned by `yaw`, its bottom edge on `base_y`.
func _upright(b: MeshBuilder, tile: StringName, base: Vector3, yaw: float, hw: float, height: float, col: Color, lean: float, level_weight: float, hmax: float) -> void:
	var right := Vector3(cos(yaw), 0.0, sin(yaw))
	var out := Vector3(-sin(yaw), 0.0, cos(yaw))
	var up := (UP * cos(lean) + out * sin(lean)).normalized()
	var c := base + up * (height * 0.5)
	var n := (out * 0.6 + UP * 0.4).normalized()
	_card(b, tile, c, right, up, hw, height * 0.5, col, n, _lvl(c.y + height * 0.5, hmax, level_weight))


## A tapered tube along `pts` with `radii`; `sides` around; the bark tile along it. The wind level
## rises with height (`weight` 0 keeps it still).
func _tube(b: MeshBuilder, pts: Array[Vector3], radii: Array[float], sides: int, col: Color, weight: float, hmax: float, cap: bool = false) -> void:
	var r := atlas.uv(BARK)
	var rings: Array[PackedInt32Array] = []
	var n := pts.size()
	for i in n:
		var t: Vector3
		if i == 0:
			t = pts[1] - pts[0]
		elif i == n - 1:
			t = pts[i] - pts[i - 1]
		else:
			t = pts[i + 1] - pts[i - 1]
		t = t.normalized()
		var ref := UP if absf(t.dot(UP)) < 0.95 else Vector3.RIGHT
		var s := ref.cross(t).normalized()
		var u := t.cross(s).normalized()
		var level := _lvl(pts[i].y, hmax, weight)
		var v := lerpf(r.end.y, r.position.y, float(i) / float(n - 1))
		var ring := PackedInt32Array()
		var shade := lerpf(0.72, 1.0, float(i) / float(n - 1))
		for j in sides + 1:
			var a := TAU * float(j) / float(sides)
			var dir := s * cos(a) + u * sin(a)
			var uu := r.position.x + r.size.x * float(j) / float(sides) + 2.0 * float(level)
			ring.append(b.vertex(pts[i] + dir * radii[i], dir, Vector2(uu, v), col * Color(shade, shade, shade, 1.0)))
		rings.append(ring)
	for i in n - 1:
		for j in sides:
			b.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j])
	if cap:
		var top := rings[n - 1]
		var centre := b.vertex(pts[n - 1], UP, Vector2(r.position.x, r.position.y), col)
		for j in sides:
			b.triangle(top[j], top[j + 1], centre)


## Straight trunk with a slight bend: n+1 points from base to `top`, radius from r0 to r1.
func _trunk(b: MeshBuilder, top: Vector3, r0: float, r1: float, sides: int, segs: int, col: Color, bend: Vector3, hmax: float, flare: float = 0.0) -> Array[Vector3]:
	var pts: Array[Vector3] = []
	var radii: Array[float] = []
	for i in segs + 1:
		var f := float(i) / float(segs)
		pts.append(top * f + bend * (f * f))
		var rr := lerpf(r0, r1, f)
		if i == 0:
			rr *= 1.0 + flare
		radii.append(rr)
	_tube(b, pts, radii, sides, col, 0.12, hmax, true)
	return pts


## Leaf cards over an ellipsoid shell (a crown): `count` cards of half size `size`, on the
## species' tile(s), shaded darker low and inside.
func _crown(b: MeshBuilder, tiles: Array[StringName], alt_share: float, centre: Vector3, radii: Vector3, count: int, size: float, tint: Color, hmax: float, weight: float, lower_cut: float = -0.35, aspect: float = 1.0) -> void:
	var golden := 2.399963
	for i in count:
		var f := (float(i) + 0.5) / float(count)
		var cy := lerpf(1.0, lower_cut, f)
		var ring := sqrt(maxf(0.0, 1.0 - cy * cy))
		var lon := float(i) * golden + _rng.randf() * 0.5
		var shell := 0.72 + 0.28 * _rng.randf()
		var dir := Vector3(ring * cos(lon), cy, ring * sin(lon))
		var p := centre + dir * radii * shell
		var n := (dir * Vector3(1.0 / radii.x, 1.0 / radii.y, 1.0 / radii.z)).normalized()
		n = (n + UP * 0.25).normalized()
		var roll := _rng.randf() * TAU
		var right := UP.cross(n)
		if right.length() < 0.2:
			right = Vector3.RIGHT
		right = right.normalized().rotated(n, roll)
		var up := n.cross(right).normalized()
		var tile: StringName = tiles[0] if (tiles.size() == 1 or _rng.randf() >= alt_share) else tiles[1]
		var hfrac := clampf((p.y - (centre.y - radii.y)) / maxf(radii.y * 2.0, 0.1), 0.0, 1.0)
		var ao := lerpf(0.58, 1.04, pow(hfrac, 0.8)) * (0.94 + 0.12 * _rng.randf())
		var jitter := 0.8 + 0.4 * _rng.randf()
		var col := Color(tint.r * ao, tint.g * ao, tint.b * ao, 1.0)
		if tile == &"flower_red":
			col = Color(ao, ao, ao, 1.0)
		var s := size * jitter
		_card(b, tile, p, right, up, s * aspect, s, col, n, _lvl(p.y, hmax, weight))


## Limbs from the trunk's top out to points of the crown.
func _limbs(b: MeshBuilder, from: Vector3, count: int, reach: float, rise: float, r0: float, sides: int, col: Color, hmax: float, droop: float = 0.0) -> void:
	for i in count:
		var a := TAU * (float(i) + 0.3 * _rng.randf()) / float(count)
		var out := Vector3(cos(a), 0.0, sin(a))
		var mid := from + out * reach * 0.45 + UP * rise * 0.7
		var tip := from + out * reach + UP * (rise - droop)
		var pts: Array[Vector3] = [from, mid, tip]
		var radii: Array[float] = [r0, r0 * 0.7, r0 * 0.38]
		_tube(b, pts, radii, sides, col, 0.5, hmax)


func _i(a: Array, lod: int) -> int:
	return int(a[lod])


func _f(a: Array, lod: int) -> float:
	return float(a[lod])


func _tint(r: float, g: float, bl: float) -> Color:
	return Color(r, g, bl, 1.0)


# ---------------------------------------------------------------------------------------------
# Species

func _build(b: MeshBuilder, id: StringName, lod: int) -> void:
	_rng.seed = hash(String(id)) & 0x7fffffff
	match id:
		TreeSpecies.NEEM:
			_broadleaf(b, lod, {"tiles": [&"leaf_neem"], "alt": 0.0, "h": 11.0, "trunk_h": 3.8, "r0": 0.34, "r1": 0.2, "lean": Vector3(0.5, 0, 0.2),
				"cy": 7.2, "radii": Vector3(4.3, 3.6, 4.3), "cards": [46, 17, 8], "size": [2.1, 3.3, 4.6], "tint": _tint(0.74, 0.92, 0.66),
				"limbs": 3, "reach": 2.6, "rise": 1.8, "bark": _tint(0.82, 0.78, 0.74)})
		TreeSpecies.RAIN:
			_broadleaf(b, lod, {"tiles": [&"leaf_feather"], "alt": 0.0, "h": 14.0, "trunk_h": 4.4, "r0": 0.5, "r1": 0.34, "lean": Vector3(1.0, 0, -0.4),
				"cy": 10.2, "radii": Vector3(9.5, 3.2, 9.5), "cards": [54, 20, 8], "size": [3.2, 4.8, 7.0], "tint": _tint(0.8, 0.98, 0.58), "lower_cut": 0.12,
				"limbs": 5, "reach": 6.0, "rise": 4.4, "bark": _tint(0.74, 0.7, 0.66), "aspect": 1.15})
		TreeSpecies.BANYAN:
			_banyan(b, lod)
		TreeSpecies.TAMARIND:
			_broadleaf(b, lod, {"tiles": [&"leaf_feather"], "alt": 0.0, "h": 13.0, "trunk_h": 3.4, "r0": 0.5, "r1": 0.3, "lean": Vector3(0.3, 0, 0.1),
				"cy": 8.4, "radii": Vector3(5.0, 4.7, 5.0), "cards": [50, 19, 8], "size": [2.4, 3.8, 5.4], "tint": _tint(0.5, 0.74, 0.42),
				"limbs": 3, "reach": 2.8, "rise": 2.6, "bark": _tint(0.6, 0.55, 0.5)})
		TreeSpecies.GULMOHAR:
			_broadleaf(b, lod, {"tiles": [&"leaf_feather", &"flower_red"], "alt": 0.6, "h": 8.5, "trunk_h": 3.2, "r0": 0.32, "r1": 0.22, "lean": Vector3(0.7, 0, 0.3),
				"cy": 6.3, "radii": Vector3(5.6, 2.3, 5.6), "cards": [44, 16, 8], "size": [2.6, 4.0, 5.6], "tint": _tint(0.78, 0.98, 0.62), "lower_cut": 0.0,
				"limbs": 4, "reach": 3.6, "rise": 2.2, "bark": _tint(0.78, 0.74, 0.7), "aspect": 1.1})
		TreeSpecies.COCONUT:
			_coconut(b, lod)
		TreeSpecies.PALMYRA:
			_palmyra(b, lod)
		TreeSpecies.MANGO:
			_broadleaf(b, lod, {"tiles": [&"leaf_broad"], "alt": 0.0, "h": 10.0, "trunk_h": 2.2, "r0": 0.42, "r1": 0.3, "lean": Vector3(0.2, 0, 0.1),
				"cy": 5.4, "radii": Vector3(5.8, 3.0, 5.8), "cards": [48, 18, 8], "size": [2.3, 3.6, 5.0], "tint": _tint(0.42, 0.7, 0.36),
				"limbs": 3, "reach": 2.4, "rise": 2.2, "bark": _tint(0.55, 0.5, 0.46)})
		TreeSpecies.PEEPAL:
			_broadleaf(b, lod, {"tiles": [&"leaf_broad"], "alt": 0.0, "h": 14.0, "trunk_h": 3.8, "r0": 0.46, "r1": 0.3, "lean": Vector3(0.4, 0, -0.2),
				"cy": 9.0, "radii": Vector3(5.4, 4.6, 5.4), "cards": [48, 18, 8], "size": [2.4, 3.8, 5.2], "tint": _tint(0.72, 0.98, 0.52),
				"limbs": 4, "reach": 3.4, "rise": 2.6, "bark": _tint(0.86, 0.84, 0.8)})
		TreeSpecies.CASUARINA:
			_casuarina(b, lod)
		TreeSpecies.OLEANDER:
			_bush(b, lod, &"oleander", 2.6, 1.3, [7, 4, 2], _tint(0.9, 1.0, 0.9), 0.5)
		TreeSpecies.BOUGAINVILLEA:
			_dome(b, lod)
		TreeSpecies.CROTON:
			_bush(b, lod, &"croton", 1.3, 0.8, [6, 3, 2], _tint(1.0, 1.0, 1.0), 0.3)
		TreeSpecies.GRASS_TUFT:
			_bush(b, lod, &"grass", 0.8, 0.6, [3, 2, 1], _tint(1.0, 1.0, 0.9), 1.0)
		TreeSpecies.SCRUB:
			_scrub(b, lod)
		TreeSpecies.DEAD_BARE:
			_dead_bare(b, lod)
		TreeSpecies.DEAD_SNAG:
			_dead_snag(b, lod)
		TreeSpecies.DEAD_PALM:
			_dead_palm(b, lod)


func _broadleaf(b: MeshBuilder, lod: int, p: Dictionary) -> void:
	var h: float = p["h"]
	var bark: Color = p["bark"]
	var trunk_h: float = p["trunk_h"]
	var lean: Vector3 = p["lean"]
	var sides := _i([7, 5, 3], lod)
	var segs := _i([4, 2, 1], lod)
	var top := Vector3(0.0, trunk_h, 0.0)
	_trunk(b, top, float(p["r0"]), float(p["r1"]), sides, segs, bark, lean, h, 0.35 if lod == 0 else 0.0)
	var from := top + lean
	var cy: float = p["cy"]
	var radii: Vector3 = p["radii"]
	var centre := Vector3(lean.x * 1.2, cy, lean.z * 1.2)
	if lod == 0:
		_limbs(b, from, int(p["limbs"]), float(p["reach"]), float(p["rise"]), float(p["r1"]) * 0.8, 5, bark, h)
	var tiles: Array[StringName] = []
	for t: StringName in p["tiles"]:
		tiles.append(t)
	var size: float = float((p["size"] as Array)[lod])
	var count: int = int((p["cards"] as Array)[lod])
	_crown(b, tiles, float(p["alt"]), centre, radii, count, size, p["tint"] as Color, h, 1.0, float(p.get("lower_cut", -0.35)), float(p.get("aspect", 1.0)))


func _banyan(b: MeshBuilder, lod: int) -> void:
	var bark := _tint(0.5, 0.46, 0.42)
	var h := 16.0
	var sides := _i([8, 5, 3], lod)
	var top := Vector3(0.0, 3.4, 0.0)
	_trunk(b, top, 0.95, 0.7, sides, _i([3, 2, 1], lod), bark, Vector3(0.4, 0, 0.2), h, 0.6 if lod == 0 else 0.0)
	var centre := Vector3(0.4, 10.4, 0.2)
	var radii := Vector3(10.5, 4.6, 10.5)
	if lod == 0:
		_limbs(b, top + Vector3(0.4, 0, 0.2), 4, 7.0, 4.8, 0.45, 5, bark, h)
	var tiles: Array[StringName] = [&"leaf_broad"]
	_crown(b, tiles, 0.0, centre, radii, _i([46, 22, 8], lod), _f([3.6, 5.4, 7.6], lod), _tint(0.4, 0.66, 0.34), h, 0.9, -0.15, 1.1)
	# Aerial roots: hanging ropes from the crown's rim, and thick prop roots that reached the ground.
	var ropes := _i([8, 3, 0], lod)
	for i in ropes:
		var a := TAU * float(i) / float(ropes) + _rng.randf() * 0.4
		var r := 4.5 + 5.0 * _rng.randf()
		var x := cos(a) * r
		var z := sin(a) * r
		var topy := 7.2 + _rng.randf() * 1.2
		var pts: Array[Vector3] = [Vector3(x, topy, z), Vector3(x * 1.03, 0.0, z * 1.03)]
		var rad: Array[float] = [0.1, 0.14]
		_tube(b, pts, rad, 3, _tint(0.55, 0.5, 0.45), 0.25, h)
	var props := _i([2, 0, 0], lod)
	for i in props:
		var a2 := TAU * float(i) / 3.0 + 0.6
		var x2 := cos(a2) * 5.0
		var z2 := sin(a2) * 5.0
		var pts2: Array[Vector3] = [Vector3(x2 * 0.97, 0.0, z2 * 0.97), Vector3(x2 * 0.9, 3.0, z2 * 0.9), Vector3(x2 * 0.6, 6.6, z2 * 0.6)]
		var rad2: Array[float] = [0.5, 0.36, 0.28]
		_tube(b, pts2, rad2, 5, bark, 0.1, h)


func _coconut(b: MeshBuilder, lod: int) -> void:
	var h := 12.0
	var bark := _tint(1.25, 1.2, 1.1)
	var sides := _i([6, 4, 3], lod)
	var segs := _i([6, 3, 1], lod)
	var pts: Array[Vector3] = []
	var radii: Array[float] = []
	for i in segs + 1:
		var f := float(i) / float(segs)
		pts.append(Vector3(0.0, 10.4 * f, 0.0) + Vector3(1.6, 0, 0.7) * (f * f))
		radii.append(lerpf(0.26, 0.17, f) * (1.35 if i == 0 else 1.0))
	_tube(b, pts, radii, sides, bark, 0.15, h, true)
	var top := pts[segs]
	var fronds := _i([12, 8, 6], lod)
	var length := 5.6
	var width := 3.0
	var seg := _i([3, 2, 1], lod)
	for i in fronds:
		var a := TAU * float(i) / float(fronds) + _rng.randf() * 0.35
		var dir := Vector3(cos(a), 0.0, sin(a))
		var side := Vector3(-dir.z, 0.0, dir.x)
		var pitch := 0.95 - 0.55 * float(i % 3) / 2.0 + _rng.randf() * 0.15
		var droop := 2.2 + 1.5 * float(i % 2)
		var prev_a: int = -1
		var prev_b: int = -1
		for k in seg + 1:
			var t := float(k) / float(seg)
			var p := top + dir * (length * t * cos(pitch)) + UP * (length * t * sin(pitch) - droop * t * t) + UP * 0.2
			var r := atlas.uv(&"frond")
			var u := lerpf(r.position.x, r.end.x, t) + 2.0 * float(_lvl(p.y, h, 1.0))
			var ao := 0.78 + 0.26 * t
			var col := Color(0.62 * ao, 0.86 * ao, 0.5 * ao, 1.0)
			var nrm := (UP * 0.6 + dir * 0.2).normalized()
			var va := b.vertex(p + side * (width * 0.42), nrm, Vector2(u, r.position.y), col)
			var vb := b.vertex(p - side * (width * 0.58), nrm, Vector2(u, r.end.y), col)
			if prev_a >= 0:
				b.quad(prev_a, prev_b, vb, va)
			prev_a = va
			prev_b = vb
	if lod == 0:
		for i in 3:
			var a3 := TAU * float(i) / 3.0 + 0.4
			_blob(b, top + Vector3(cos(a3) * 0.35, -0.35, sin(a3) * 0.35), 0.22, _tint(0.52, 0.66, 0.26))


## A tiny three-sided ball of vertex colour (coconuts) using the bark tile as a flat colour.
func _blob(b: MeshBuilder, c: Vector3, r: float, col: Color) -> void:
	var uvr := atlas.uv(BARK)
	var uv := uvr.get_center()
	var pts: Array[Vector3] = [c + Vector3(0, r, 0), c + Vector3(r, 0, 0), c + Vector3(-r * 0.5, 0, r * 0.87), c + Vector3(-r * 0.5, 0, -r * 0.87), c + Vector3(0, -r, 0)]
	var ids: Array[int] = []
	for p in pts:
		ids.append(b.vertex(p, (p - c).normalized(), uv, col))
	b.triangle(ids[0], ids[1], ids[2])
	b.triangle(ids[0], ids[2], ids[3])
	b.triangle(ids[0], ids[3], ids[1])
	b.triangle(ids[4], ids[2], ids[1])
	b.triangle(ids[4], ids[3], ids[2])
	b.triangle(ids[4], ids[1], ids[3])


## A fan leaf standing on `base`, its blades spreading along `dir` rising by `tilt` from the
## vertical: palmyra crowns and the dry skirt.
func _fan(b: MeshBuilder, tile: StringName, base: Vector3, dir: Vector3, tilt: float, hw: float, hh: float, col: Color, hang: bool, hmax: float) -> void:
	var side := Vector3(-dir.z, 0.0, dir.x)
	var up := (UP * cos(tilt) + dir * sin(tilt)).normalized()
	if hang:
		up = (-UP * 0.9 + dir * 0.4).normalized()
	var n := (dir * 0.5 + UP * 0.6).normalized()
	_card(b, tile, base + up * hh, side, up, hw, hh, col, n, _lvl(base.y + hh, hmax, 0.9))


func _palmyra(b: MeshBuilder, lod: int) -> void:
	var h := 14.0
	var bark := _tint(1.05, 0.98, 0.92)
	var sides := _i([6, 4, 3], lod)
	var segs := _i([6, 3, 1], lod)
	var pts: Array[Vector3] = []
	var radii: Array[float] = []
	for i in segs + 1:
		var f := float(i) / float(segs)
		pts.append(Vector3(0.0, 11.4 * f, 0.0) + Vector3(0.35, 0, 0.15) * (f * f))
		radii.append(lerpf(0.34, 0.24, f) * (1.5 if i == 0 else 1.0))
	_tube(b, pts, radii, sides, bark, 0.1, h, true)
	var top := pts[segs]
	var fans := _i([15, 9, 6], lod)
	for i in fans:
		var a := TAU * float(i) / float(fans) + _rng.randf() * 0.3
		var dir := Vector3(cos(a), 0.0, sin(a))
		var tilt := 0.35 + 1.0 * float(i % 4) / 3.0
		var col := Color(0.7 + 0.2 * _rng.randf(), 0.95, 0.62, 1.0)
		_fan(b, &"fan", top + dir * 0.25 + UP * 0.1, dir, tilt, 1.75, 1.9, col, false, h)
	var skirt := _i([9, 4, 0], lod)
	for i in skirt:
		var a2 := TAU * float(i) / float(skirt) + 0.3
		var dir2 := Vector3(cos(a2), 0.0, sin(a2))
		_fan(b, &"fan_dry", top + dir2 * 0.3 - UP * 0.1, dir2, 0.0, 1.4, 1.5, Color(0.8, 0.74, 0.64, 1.0), true, h)


func _casuarina(b: MeshBuilder, lod: int) -> void:
	var h := 15.0
	var sides := _i([6, 4, 3], lod)
	var pts: Array[Vector3] = []
	var radii: Array[float] = []
	var segs := _i([5, 2, 1], lod)
	for i in segs + 1:
		var f := float(i) / float(segs)
		pts.append(Vector3(0.0, 13.0 * f, 0.0) + Vector3(0.9, 0, 0.3) * (f * f))
		radii.append(lerpf(0.24, 0.06, f))
	_tube(b, pts, radii, sides, _tint(0.55, 0.5, 0.45), 0.15, h, true)
	var tiers := _i([9, 5, 3], lod)
	var per := _i([6, 5, 4], lod)
	for t in tiers:
		var f := float(t) / float(tiers - 1)
		var y := lerpf(13.4, 4.2, f)
		var rad := lerpf(0.5, 1.7, f)
		var centre_x := pts[mini(segs, int(round(lerpf(float(segs), 1.0, f))))].x
		for i in per:
			var a := TAU * (float(i) + 0.5 * float(t % 2)) / float(per) + _rng.randf() * 0.2
			var dir := Vector3(cos(a), 0.0, sin(a))
			var side := Vector3(-dir.z, 0.0, dir.x)
			var p := Vector3(centre_x * 0.8, y, 0.0) + dir * rad
			# Needles hang from the card's top edge, which leans in towards the trunk: a drooping skirt.
			var up := (UP * 0.8 - dir * 0.35).normalized()
			var ao := lerpf(1.0, 0.66, f)
			var col := Color(0.62 * ao, 0.78 * ao, 0.6 * ao, 1.0)
			var hw := lerpf(1.1, 2.4, f) * (1.0 if lod == 0 else 1.25)
			var hh := lerpf(1.2, 2.0, f) * (1.0 if lod == 0 else 1.3)
			_card(b, &"needle", p - up * (hh * 0.7), side, up, hw, hh, col, (dir + UP * 0.3).normalized(), _lvl(y, h, 1.0))


## Upright cards crossing at the origin (oleander, croton, grass).
func _bush(b: MeshBuilder, lod: int, tile: StringName, h: float, hw: float, counts: Array, tint: Color, weight: float) -> void:
	var n: int = int(counts[lod])
	for i in n:
		var yaw := TAU * float(i) / float(maxi(n, 2)) * (0.5 if n > 1 else 1.0) + 0.4 * float(i % 2)
		if n == 1:
			yaw = 0.0
		var ao := 0.82 + 0.2 * _rng.randf()
		var col := Color(tint.r * ao, tint.g * ao, tint.b * ao, 1.0)
		var lean := 0.0 if tile == &"grass" else (0.2 * float((i % 3) - 1))
		var off := Vector3(cos(yaw + 1.2), 0.0, sin(yaw + 1.2)) * (0.0 if n < 4 else 0.18 * hw)
		_upright(b, tile, off, yaw, hw, h * (0.85 + 0.25 * _rng.randf()), col, lean, weight, h)
	if tile == &"grass" and lod == 0:
		_upright(b, tile, Vector3.ZERO, 0.9, hw * 0.8, h * 0.8, tint, 0.1, weight, h)


## Bougainvillea: a magenta mound of tilted bowl-shaped cards over upright ones.
func _dome(b: MeshBuilder, lod: int) -> void:
	var h := 2.4
	var n := _i([8, 4, 2], lod)
	for i in n:
		var a := TAU * float(i) / float(n)
		var dir := Vector3(cos(a), 0.0, sin(a))
		var tilt := 0.55 if i % 2 == 0 else 0.15
		var up := (UP * cos(tilt) + dir * sin(tilt)).normalized()
		var side := Vector3(-dir.z, 0.0, dir.x)
		var c := dir * 0.3 + up * 0.95
		var ao := 0.85 + 0.2 * _rng.randf()
		_card(b, &"bougainvillea", c, side, up, 1.4, 1.25, Color(ao, ao, ao, 1.0), (dir * 0.6 + UP * 0.5).normalized(), _lvl(c.y, h, 0.4))
	if lod == 0:
		_card(b, &"bougainvillea", Vector3(0, 2.0, 0), Vector3.RIGHT, Vector3.FORWARD, 1.2, 1.2, Color(1, 1, 1, 1), UP, _lvl(2.0, h, 0.4))


func _scrub(b: MeshBuilder, lod: int) -> void:
	var n := _i([4, 2, 1], lod)
	for i in n:
		var yaw := TAU * float(i) / float(n) * 0.5 + 0.3 * float(i)
		var dry := Color(0.92, 0.78, 0.46, 1.0)
		_upright(b, &"grass" if i % 2 == 0 else &"twigs", Vector3.ZERO, yaw, 0.9 if i % 2 == 0 else 0.55, 1.1, dry if i % 2 == 0 else Color(1, 1, 1, 1), 0.1, 0.5, 1.2)


func _dead_bare(b: MeshBuilder, lod: int) -> void:
	var h := 8.0
	var bark := _tint(0.62, 0.58, 0.54)
	var sides := _i([6, 4, 3], lod)
	var top := Vector3(0.3, 4.2, 0.2)
	_trunk(b, top, 0.32, 0.18, sides, _i([3, 2, 1], lod), bark, Vector3(0.3, 0, 0.1), h, 0.3 if lod == 0 else 0.0)
	var from := top + Vector3(0.3, 0, 0.1)
	var n := _i([8, 3, 0], lod)
	for i in n:
		var a := TAU * float(i) / float(n) + 0.5 * _rng.randf()
		var out := Vector3(cos(a), 0.0, sin(a))
		var len := 2.6 + 1.8 * _rng.randf()
		var mid := from + out * len * 0.45 + UP * (1.4 + 0.4 * _rng.randf())
		var tip := from + out * len + UP * (2.4 + 1.4 * _rng.randf())
		var pts: Array[Vector3] = [from, mid, tip]
		var rad: Array[float] = [0.16, 0.1, 0.04]
		_tube(b, pts, rad, _i([4, 3, 3], lod), bark, 0.5, h)
		if lod < 2:
			_upright(b, &"twigs", tip - UP * 0.2, a + 1.57, 1.0, 2.2, Color(0.9, 0.85, 0.8, 1.0), 0.0, 0.6, h)
	if lod == 2:
		_upright(b, &"twigs", from, 0.2, 2.6, 4.6, Color(0.9, 0.85, 0.8, 1.0), 0.0, 0.3, h)
		_upright(b, &"twigs", from, 1.8, 2.6, 4.6, Color(0.9, 0.85, 0.8, 1.0), 0.0, 0.3, h)


func _dead_snag(b: MeshBuilder, lod: int) -> void:
	var h := 5.5
	var bark := _tint(0.55, 0.52, 0.5)
	var pts: Array[Vector3] = []
	var radii: Array[float] = []
	var segs := _i([3, 2, 1], lod)
	for i in segs + 1:
		var f := float(i) / float(segs)
		pts.append(Vector3(0.0, 5.0 * f, 0.0) + Vector3(1.4, 0, 0.5) * (f * f))
		radii.append(lerpf(0.34, 0.2, f))
	_tube(b, pts, radii, _i([6, 4, 3], lod), bark, 0.1, h, true)
	if lod < 2:
		var from := pts[segs - 1]
		for k in 2:
			var out := Vector3(1.0 if k == 0 else -0.6, 0.0, 0.4 if k == 0 else -0.9).normalized()
			var p2: Array[Vector3] = [from, from + out * 0.9 + UP * 0.5]
			var r2: Array[float] = [0.12, 0.07]
			_tube(b, p2, r2, 4, bark, 0.1, h, true)


func _dead_palm(b: MeshBuilder, lod: int) -> void:
	var h := 9.0
	var bark := _tint(0.5, 0.46, 0.42)
	var pts: Array[Vector3] = []
	var radii: Array[float] = []
	var segs := _i([5, 2, 1], lod)
	for i in segs + 1:
		var f := float(i) / float(segs)
		pts.append(Vector3(0.0, 8.0 * f, 0.0) + Vector3(0.6, 0, 0.0) * (f * f))
		radii.append(lerpf(0.28, 0.2, f))
	_tube(b, pts, radii, _i([6, 4, 3], lod), bark, 0.1, h, true)
	var top := pts[segs]
	var n := _i([7, 4, 3], lod)
	for i in n:
		var a := TAU * float(i) / float(n) + 0.4
		var dir := Vector3(cos(a), 0.0, sin(a))
		_fan(b, &"fan_dry", top + dir * 0.2, dir, 0.0, 1.4, 1.6, Color(0.8, 0.74, 0.64, 1.0), true, h)
