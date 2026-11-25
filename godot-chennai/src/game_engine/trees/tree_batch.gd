class_name TreeBatch
extends Node3D
## All the plants of one chunk (G-384, G-385): per species, three MultiMeshInstance3D (one per
## LOD mesh) whose instances are re-sorted by distance from the camera a few times a second.
## An instance changes LOD when the camera passes a threshold by `TreeQuality.HYSTERESIS` (no
## cross-fade: the swap is one frame, and the models are built to look alike across LODs).
##
## Draw calls: a species draws one mesh per LOD in use, and at most two (`TreeLod.limit_meshes`:
## when all three would be in use, the far ones take the middle mesh). Empty LODs draw nothing.
## Shadows: only the LOD 0 instances, and only when `TreeQuality.shadows` (High).
## The per-instance data (position, rank, matrix and colour rows) stays on the CPU so a re-sort is
## a few slices and one buffer upload a species; tests read `shown` and `draw_calls()`.

const STRIDE := 16
## Seconds between distance checks of a batch (each batch has its own phase).
const CHECK_EVERY := 0.25
## The camera must have moved this far (m) since the last check for another.
const MOVE_MIN := 1.5


## One species of the chunk.
class Group:
	extends RefCounted
	var species: StringName = &""
	var count: int = 0
	## Chunk-local position of each instance (x, y, z).
	var local: PackedVector3Array = PackedVector3Array()
	var rank: PackedFloat32Array = PackedFloat32Array()
	## 16 floats per instance: the 3x4 matrix as MultiMesh.buffer wants it, then the colour.
	var rows: PackedFloat32Array = PackedFloat32Array()
	## The LOD each instance shows now (-1 hidden), after the draw-call rule.
	var lod: PackedInt32Array = PackedInt32Array()
	## Instances drawn per LOD mesh, after the rule.
	var shown: PackedInt32Array = PackedInt32Array([0, 0, 0])
	var nodes: Array[MultiMeshInstance3D] = []
	var built: bool = false


var kit: TreeKit
var groups: Array[Group] = []
var _clock: float = 0.0
var _gen: int = -1
var _last_cam: Vector3 = Vector3(INF, INF, INF)
## A sort in progress: the next species to do (-1 none), the camera it is for, whether all are rebuilt.
var _cursor: int = -1
var _step_cam: Vector3 = Vector3.ZERO
var _step_forced: bool = false
## Number of re-sorts that changed something (tests).
var changes: int = 0


## Builds the batch (a worker thread is fine: nodes are not in the tree). `centre` is the chunk
## centre in world metres; instance positions are relative to it.
static func build(tree_kit: TreeKit, spots: Array[TreeSpot], centre: Vector2, focus: Vector2 = Vector2(INF, INF)) -> TreeBatch:
	var batch := TreeBatch.new()
	batch.name = "Trees"
	batch.kit = tree_kit
	var by: Dictionary[StringName, Group] = {}
	for s in spots:
		var g: Group
		if by.has(s.species):
			g = by[s.species]
		else:
			g = Group.new()
			g.species = s.species
			by[s.species] = g
			batch.groups.append(g)
		g.local.append(Vector3(s.position.x - centre.x, 0.0, s.position.y - centre.y))
		g.rank.append(s.rank)
		_append_row(g.rows, s, centre)
	for g in batch.groups:
		g.count = g.local.size()
		g.lod.resize(g.count)
		g.lod.fill(TreeLod.HIDDEN)
		_make_nodes(batch, g)
	# First sort for the camera's place at the start of the build (a worker thread), so adding the
	# chunk to the scene does no sorting; `_process` follows the camera from then on.
	if focus.x < INF:
		batch.refresh(Vector3(focus.x - centre.x, 2.0, focus.y - centre.y))
	return batch


static func _append_row(rows: PackedFloat32Array, s: TreeSpot, centre: Vector2) -> void:
	var size := s.scale
	var basis := Basis(Vector3.UP, s.yaw)
	if s.lean > 0.001 and s.lean_dir.length_squared() > 0.0:
		var d := Vector3(s.lean_dir.x, 0.0, s.lean_dir.y).normalized()
		basis = Basis(Vector3.UP.cross(d).normalized(), s.lean) * basis
	basis = basis.scaled(Vector3(size, size, size))
	var o := Vector3(s.position.x - centre.x, 0.0, s.position.y - centre.y)
	rows.append_array(PackedFloat32Array([
		basis.x.x, basis.y.x, basis.z.x, o.x,
		basis.x.y, basis.y.y, basis.z.y, o.y,
		basis.x.z, basis.y.z, basis.z.z, o.z,
		s.tint.r, s.tint.g, s.tint.b, s.tint.a]))


static func _make_nodes(batch: TreeBatch, g: Group) -> void:
	var lo := Vector3(INF, 0.0, INF)
	var hi := Vector3(-INF, 0.0, -INF)
	for p in g.local:
		lo = lo.min(p)
		hi = hi.max(p)
	var reach := TreeSpecies.number(g.species, "width") * 0.9 + 2.0
	var tall := TreeSpecies.number(g.species, "height") * 1.8 + 2.0
	var box := AABB(Vector3(lo.x - reach, -1.0, lo.z - reach), Vector3(hi.x - lo.x + reach * 2.0, tall, hi.z - lo.z + reach * 2.0))
	for lod in TreeSpecies.LODS:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = batch.kit.mesh_of(g.species, lod)
		mm.instance_count = g.count
		mm.visible_instance_count = 0
		mm.custom_aabb = box
		var node := MultiMeshInstance3D.new()
		node.name = "%s_%d" % [g.species, lod]
		node.multimesh = mm
		node.layers = ChunkBuilder.RENDER_LAYER
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.visible = false
		batch.add_child(node)
		g.nodes.append(node)


func _enter_tree() -> void:
	_clock = CHECK_EVERY * float(absi(hash(get_instance_id())) % 100) / 100.0
	# Never sorted (built without a focus): sort now for the camera, or the chunk's middle.
	if _gen == -1:
		var cam := get_viewport().get_camera_3d() if get_viewport() != null else null
		refresh(to_local(cam.global_position) if cam != null else Vector3(0.0, 1.5, 0.0))


func _process(delta: float) -> void:
	# A sort in progress goes one species a frame, so a chunk with many plants never spends more than
	# a few hundred microseconds in one frame.
	if _cursor >= 0:
		changes += _refresh_group(groups[_cursor], _step_cam, _step_forced)
		_cursor += 1
		if _cursor >= groups.size():
			_cursor = -1
		return
	_clock -= delta
	if _clock > 0.0:
		return
	_clock = CHECK_EVERY
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return
	var at := to_local(cam.global_position)
	if _gen == TreeQuality.generation and at.distance_squared_to(_last_cam) < MOVE_MIN * MOVE_MIN:
		return
	_step_forced = _gen != TreeQuality.generation
	_gen = TreeQuality.generation
	_last_cam = at
	_step_cam = at
	if not groups.is_empty():
		_cursor = 0


## Sorts every instance to a LOD for a camera at `cam` (chunk-local metres) and rebuilds the
## species whose sorting changed. Returns how many species changed.
func refresh(cam: Vector3) -> int:
	var forced := _gen != TreeQuality.generation
	_gen = TreeQuality.generation
	_last_cam = cam
	_cursor = -1
	var changed_groups := 0
	for g in groups:
		changed_groups += _refresh_group(g, cam, forced)
	changes += changed_groups
	return changed_groups


## One species: 1 when its sorting changed (and it was rebuilt), else 0.
func _refresh_group(g: Group, cam: Vector3, forced: bool) -> int:
	var t0 := TreeQuality.lod0
	var t1 := TreeQuality.lod1
	var far := TreeQuality.far_of(g.species)
	var keep := TreeQuality.kept(g.species)
	var changed := forced or not g.built
	for i in g.count:
		var cur := g.lod[i]
		var want: int
		if g.rank[i] >= keep:
			want = TreeLod.HIDDEN
		else:
			want = TreeLod.pick(cam.distance_to(g.local[i]), cur, t0, t1, far, TreeQuality.HYSTERESIS)
		if want != cur:
			g.lod[i] = want
			changed = true
	if changed:
		_rebuild(g)
		return 1
	return 0


func _rebuild(g: Group) -> void:
	g.built = true
	var counts := PackedInt32Array([0, 0, 0])
	for l in g.lod:
		if l >= 0:
			counts[l] += 1
	var limited := TreeLod.limit_meshes(counts)
	var merged := limited[2] != counts[2]
	counts = limited
	g.shown = counts
	var bufs: Array[PackedFloat32Array] = [PackedFloat32Array(), PackedFloat32Array(), PackedFloat32Array()]
	for i in g.count:
		var l := g.lod[i]
		if l < 0:
			continue
		if merged and l == 2:
			l = 1
		bufs[l].append_array(g.rows.slice(i * STRIDE, (i + 1) * STRIDE))
	for lod in TreeSpecies.LODS:
		var node := g.nodes[lod]
		var mm := node.multimesh
		var n := counts[lod]
		node.visible = n > 0
		if n > 0:
			var buf := bufs[lod]
			buf.resize(g.count * STRIDE)
			mm.buffer = buf
		mm.visible_instance_count = n
		var casting := lod == 0 and TreeQuality.shadows
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if casting else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## Meshes drawn now (each a draw call without shadows), and the most any one species draws.
func draw_calls() -> int:
	var n := 0
	for g in groups:
		for lod in TreeSpecies.LODS:
			if g.shown[lod] > 0:
				n += 1
	return n


func max_draws_per_species() -> int:
	var most := 0
	for g in groups:
		var n := 0
		for lod in TreeSpecies.LODS:
			if g.shown[lod] > 0:
				n += 1
		most = maxi(most, n)
	return most


## Triangles drawn now.
func triangles_now() -> int:
	var n := 0
	for g in groups:
		var tris: PackedInt32Array = kit.triangles[g.species]
		for lod in TreeSpecies.LODS:
			n += g.shown[lod] * tris[lod]
	return n


func instance_count() -> int:
	var n := 0
	for g in groups:
		n += g.count
	return n


## Species present, with counts.
func species_counts() -> Dictionary[StringName, int]:
	var out: Dictionary[StringName, int] = {}
	for g in groups:
		out[g.species] = g.count
	return out


## Removes the instances for which `drop` says true (the railway index arrived after this chunk was
## built, G-383). Rebuilds what changed at the next check.
func prune(drop: Callable) -> int:
	var removed := 0
	for g in groups:
		var keep_idx: Array[int] = []
		for i in g.count:
			var p := g.local[i]
			if not bool(drop.call(p)):
				keep_idx.append(i)
		if keep_idx.size() == g.count:
			continue
		removed += g.count - keep_idx.size()
		var local := PackedVector3Array()
		var rank := PackedFloat32Array()
		var rows := PackedFloat32Array()
		for i in keep_idx:
			local.append(g.local[i])
			rank.append(g.rank[i])
			rows.append_array(g.rows.slice(i * STRIDE, (i + 1) * STRIDE))
		g.local = local
		g.rank = rank
		g.rows = rows
		g.count = local.size()
		g.lod.resize(g.count)
		g.lod.fill(TreeLod.HIDDEN)
		for node in g.nodes:
			node.multimesh.instance_count = g.count
			node.multimesh.visible_instance_count = 0
		g.built = false
	if removed > 0:
		_gen = -1
	return removed
