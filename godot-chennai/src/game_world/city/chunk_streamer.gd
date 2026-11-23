class_name ChunkStreamer
extends Node
## Keeps the chunks near a point in the scene and frees the ones left behind (`ChunkManager.ts`,
## decisions G-50, G-51).
##
## - **Off the main thread:** reading, decoding and building a chunk (meshes, colliders, node
##   trees not yet in the scene) run on `WorkerThreadPool`, at most `in_flight` at once,
##   nearest first (`ChunkBuilder`).
## - **Time-sliced on the main thread:** finished builds are added in small steps (one collider
##   body, or the chunk's visual node) while the frame's budget lasts, at least one step a frame;
##   unloads are freed the same way. A chunk's meshes join the scene in one step, once its
##   colliders are in, so nothing half-built is ever seen.
## - **Gating (§7 lesson):** `world_ready_around(point)` is true only when every chunk within
##   reach of the point is in the scene **and** a physics step has run since its last collider was
##   added. AI and combat wait on it (`await wait_ready_around(...)`).
## - **Floating origin (G-7):** each chunk's two roots (colliders, meshes) are placed at its
##   centre in scene space and join `WorldOrigin.GROUP`, so a recentre moves them; meshes are
##   local to the chunk centre, so they stay precise anywhere in the region.

signal chunk_shown(cell: Vector2i)
signal chunk_hidden(cell: Vector2i)
## Emitted (with the point) when an area someone waits on becomes ready.
signal area_ready(point: Vector2)

## Chunks whose nearest edge is within this distance are loaded (metres).
@export var load_distance: float = 260.0
## Chunks further than this are freed; larger than `load_distance` to avoid thrashing.
@export var unload_distance: float = 340.0
## Chunk builds running on worker threads at once.
@export var in_flight: int = 3
## Main-thread time for adding and freeing chunk parts per frame, microseconds.
@export var budget_usec: int = 2500

var kit: ChunkBuilder.Kit
## The point (world metres) the streamer keeps loaded round; set it every frame.
var focus: Vector2 = Vector2.ZERO
var active: bool = false

## Per-chunk state: &"building" (task on a worker), &"adding" (bodies going in), &"shown".
class Slot:
	extends RefCounted
	var cell: Vector2i
	var state: StringName = &"building"
	var task: int = -1
	var build: ChunkBuilder.Build
	var bodies_root: Node3D
	var added: int = 0
	## Physics frame when the last part joined the scene.
	var shown_frame: int = -1

var _slots: Dictionary[Vector2i, Slot] = {}
## Builds whose chunk went out of range while building: freed once their task finishes.
var _orphans: Array[Slot] = []
## Roots to free, a few a frame.
var _doomed: Array[Node] = []
var _waiters: Array[Array] = []  # [point, radius]
var _physics_frames: int = 0
## Statistics for tests, the HUD and the report.
var stats := {
	"built": 0, "failed": 0, "freed": 0,
	"last_frame_usec": 0, "max_frame_usec": 0, "max_step_usec": 0,
	"max_build_usec": 0, "total_build_usec": 0,
}
var last_error: String = ""


func _physics_process(_delta: float) -> void:
	_physics_frames += 1


func _process(_delta: float) -> void:
	if active:
		step()


## Starts streaming with a ready kit.
func start(with_kit: ChunkBuilder.Kit) -> void:
	kit = with_kit
	active = true


## One frame of streaming: start builds, collect finished ones, spend the main-thread budget.
func step() -> void:
	var started := Time.get_ticks_usec()
	_drop_far()
	_collect()
	_start_builds()
	var steps := 0
	while true:
		var t := Time.get_ticks_usec()
		if not _one_main_step():
			break
		steps += 1
		stats["max_step_usec"] = maxi(stats["max_step_usec"], Time.get_ticks_usec() - t)
		if Time.get_ticks_usec() - started >= budget_usec:
			break
	_settle()
	var spent := Time.get_ticks_usec() - started
	stats["last_frame_usec"] = spent
	stats["max_frame_usec"] = maxi(stats["max_frame_usec"], spent)


## Distance from a point to a chunk square's nearest edge (0 inside it).
func distance_to_cell(cell: Vector2i, p: Vector2) -> float:
	var size := kit.layout.chunk_size
	var lo := kit.layout.bounds.position + Vector2(cell) * size
	return p.distance_to(p.clamp(lo, lo + Vector2(size, size)))


## Chunks in load range of a point, nearest first.
func wanted(p: Vector2, reach: float = -1.0) -> Array[Vector2i]:
	return kit.source.chunks_near(p, load_distance if reach < 0.0 else reach)


func _drop_far() -> void:
	for cell: Vector2i in _slots.keys():
		if distance_to_cell(cell, focus) <= unload_distance:
			continue
		var slot: Slot = _slots[cell]
		_slots.erase(cell)
		if slot.state == &"building":
			_orphans.append(slot)
			continue
		if slot.bodies_root != null:
			_doomed.append(slot.bodies_root)
		if slot.state == &"shown":
			if slot.build.view != null:
				_doomed.append(slot.build.view)
			chunk_hidden.emit(cell)
		else:
			_discard_unadded(slot)


## Frees the parts of a build that never entered the tree.
func _discard_unadded(slot: Slot) -> void:
	if slot.build == null:
		return
	for i in range(slot.added, slot.build.bodies.size()):
		slot.build.bodies[i].free()
	if slot.build.view != null and not slot.build.view.is_inside_tree():
		slot.build.view.free()


func _collect() -> void:
	for slot: Slot in _slots.values():
		if slot.state == &"building" and WorkerThreadPool.is_task_completed(slot.task):
			_finish(slot)
	for i in range(_orphans.size() - 1, -1, -1):
		var o := _orphans[i]
		if WorkerThreadPool.is_task_completed(o.task):
			WorkerThreadPool.wait_for_task_completion(o.task)
			_discard_unadded(o)
			_orphans.remove_at(i)


func _finish(slot: Slot) -> void:
	WorkerThreadPool.wait_for_task_completion(slot.task)
	slot.task = -1
	if slot.build.error != "":
		stats["failed"] += 1
		last_error = slot.build.error
		push_warning("Chunk %s: %s" % [slot.cell, slot.build.error])
	stats["built"] += 1
	stats["max_build_usec"] = maxi(stats["max_build_usec"], slot.build.usec)
	stats["total_build_usec"] += slot.build.usec
	slot.state = &"adding"


func _running() -> int:
	var n := _orphans.size()
	for slot: Slot in _slots.values():
		if slot.state == &"building":
			n += 1
	return n


func _start_builds() -> void:
	var running := _running()
	if running >= in_flight:
		return
	for cell in wanted(focus):
		if running >= in_flight:
			break
		if _slots.has(cell):
			continue
		var slot := Slot.new()
		slot.cell = cell
		var k := kit
		slot.task = WorkerThreadPool.add_task(func() -> void: slot.build = ChunkBuilder.build(k, cell), false, "chunk %d,%d" % [cell.x, cell.y])
		_slots[cell] = slot
		running += 1


## One unit of main-thread work: free a root, add a collider body, or show a chunk's meshes.
## False when there was nothing to do.
func _one_main_step() -> bool:
	if not _doomed.is_empty():
		var node: Node = _doomed.pop_back()
		if node.is_inside_tree():
			node.get_parent().remove_child(node)
		node.queue_free()
		stats["freed"] += 1
		return true
	var next: Slot = null
	var best := INF
	for slot: Slot in _slots.values():
		if slot.state != &"adding":
			continue
		var d := distance_to_cell(slot.cell, focus)
		if d < best:
			best = d
			next = slot
	if next == null:
		return false
	var b := next.build
	if b.error != "":
		next.state = &"shown"
		next.shown_frame = _physics_frames
		return true
	if next.bodies_root == null:
		next.bodies_root = Node3D.new()
		next.bodies_root.name = "Solids_%d_%d" % [next.cell.x, next.cell.y]
		next.bodies_root.position = WorldOrigin.to_scene(b.centre)
		next.bodies_root.add_to_group(WorldOrigin.GROUP)
		add_child(next.bodies_root)
		return true
	if next.added < b.bodies.size():
		next.bodies_root.add_child(b.bodies[next.added])
		next.added += 1
		return true
	b.view.position = WorldOrigin.to_scene(b.centre)
	b.view.add_to_group(WorldOrigin.GROUP)
	add_child(b.view)
	next.state = &"shown"
	next.shown_frame = _physics_frames
	chunk_shown.emit(next.cell)
	return true


## True when every chunk within `radius` (default: the load distance) of a point is in the
## scene with its colliders, and a physics step has run since.
func world_ready_around(point: Vector2, radius: float = -1.0) -> bool:
	if kit == null:
		return false
	for cell in wanted(point, radius):
		var slot: Slot = _slots.get(cell)
		if slot == null or slot.state != &"shown" or slot.shown_frame >= _physics_frames:
			return false
	return true


## Waits (frame by frame, game time) until `world_ready_around(point, radius)`; at most
## `max_frames` process frames. Returns whether it became ready.
func wait_ready_around(point: Vector2, radius: float = -1.0, max_frames: int = 60 * 120) -> bool:
	_waiters.append([point, radius])
	for i in max_frames:
		if world_ready_around(point, radius):
			return true
		await get_tree().process_frame
	return world_ready_around(point, radius)


func _settle() -> void:
	for i in range(_waiters.size() - 1, -1, -1):
		var w: Array = _waiters[i]
		if world_ready_around(w[0], w[1]):
			_waiters.remove_at(i)
			area_ready.emit(w[0])


## Builds every chunk round the focus now, on the calling thread's worker pool, and adds them
## at once: for a start-up behind a loading screen or a teleport, never during play.
func fill_now() -> void:
	var guard := 0
	while not world_ready_around(focus) and guard < 100000:
		guard += 1
		_drop_far()
		_start_builds()
		for slot: Slot in _slots.values():
			if slot.state == &"building":
				_finish(slot)
		while _one_main_step():
			pass
		if _running() == 0 and _all_shown():
			break
	_settle()


func _all_shown() -> bool:
	for cell in wanted(focus):
		var slot: Slot = _slots.get(cell)
		if slot == null or slot.state != &"shown":
			return false
	return true


## Cells whose meshes are in the scene.
func shown_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for slot: Slot in _slots.values():
		if slot.state == &"shown":
			out.append(slot.cell)
	return out


func slot_state(cell: Vector2i) -> StringName:
	var slot: Slot = _slots.get(cell)
	return slot.state if slot != null else &""


func build_of(cell: Vector2i) -> ChunkBuilder.Build:
	var slot: Slot = _slots.get(cell)
	return slot.build if slot != null else null


## Chunks known to the streamer in any state, and builds still running for dropped chunks.
func slot_count() -> int:
	return _slots.size()


func orphan_count() -> int:
	return _orphans.size()


## Stops streaming and frees everything (waits for running builds).
func clear() -> void:
	active = false
	for slot: Slot in _slots.values():
		if slot.task >= 0:
			WorkerThreadPool.wait_for_task_completion(slot.task)
		if slot.bodies_root != null:
			slot.bodies_root.queue_free()
		if slot.state == &"shown" and slot.build != null and slot.build.view != null:
			slot.build.view.queue_free()
		else:
			_discard_unadded(slot)
	for o in _orphans:
		WorkerThreadPool.wait_for_task_completion(o.task)
		_discard_unadded(o)
	_orphans.clear()
	_slots.clear()


func _exit_tree() -> void:
	clear()
