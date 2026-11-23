class_name BackgroundTask
extends RefCounted
## Runs one function on Godot's worker threads and lets the main thread wait for it without
## blocking a frame (TD-25 lesson of the Three.js game: never decode on the main thread).
##
##     var task := BackgroundTask.start(WorldFiles.read_roads.bind(index))
##     while not task.is_done():
##         await get_tree().process_frame
##     var roads: RoadNetwork = task.result()
##
## The function must not touch nodes in the tree; it should build plain data (WorldFiles,
## WorldCodec) that the main thread then adds to the scene in small steps.

var _callable: Callable
var _result: Variant = null
var _id: int = -1
var _joined: bool = false


static func start(work: Callable) -> BackgroundTask:
	var task := BackgroundTask.new()
	task._callable = work
	task._id = WorkerThreadPool.add_task(task._run, false, "BackgroundTask")
	return task


func _run() -> void:
	_result = _callable.call()


func is_done() -> bool:
	return _joined or WorkerThreadPool.is_task_completed(_id)


## The function's return value; waits for the thread if it has not finished (call after is_done()).
func result() -> Variant:
	if not _joined:
		WorkerThreadPool.wait_for_task_completion(_id)
		_joined = true
	return _result


## Waits a frame at a time until the task finishes, then returns its result.
func finish(tree: SceneTree) -> Variant:
	while not is_done():
		await tree.process_frame
	return result()
