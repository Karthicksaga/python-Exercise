class_name ThreadClock
extends RefCounted
## The calling thread's own time on a core and its time waiting for one, from the kernel
## (Linux and Android: `/proc/<pid>/task/<tid>/schedstat`, nanoseconds), decision G-340. With it a
## slow frame is told apart: work on a core, waiting for a core (other threads of the game or
## other apps had them all), or neither (blocked on a lock, on I/O or asleep: the frame cap).
## Made on the main thread, it reads the main thread (its task id is the process id). Each read
## opens the file again (a seek back is served from Godot's read buffer, stale) and reads one short
## line. Elsewhere, or when the kernel hides it, `ok` is false.

var ok: bool = false
var _path: String = ""
var _cpu_ns: int = -1
var _wait_ns: int = -1


func _init() -> void:
	if OS.get_name() != "Linux" and OS.get_name() != "Android":
		return
	var pid := OS.get_process_id()
	_path = "/proc/%d/task/%d/schedstat" % [pid, pid]
	ok = FileAccess.file_exists(_path) and _sample()


func _sample() -> bool:
	var f := FileAccess.open(_path, FileAccess.READ)
	if f == null:
		return false
	var parts := f.get_line().split(" ", false)
	if parts.size() < 2 or not parts[0].is_valid_int() or not parts[1].is_valid_int():
		return false
	_cpu_ns = parts[0].to_int()
	_wait_ns = parts[1].to_int()
	return true


## (µs on a core, µs waiting for a core) since the last call; (-1, -1) when unknown.
func since_last() -> Vector2i:
	if not ok:
		return Vector2i(-1, -1)
	var cpu := _cpu_ns
	var wait := _wait_ns
	if not _sample():
		return Vector2i(-1, -1)
	return Vector2i(int((_cpu_ns - cpu) / 1000), int((_wait_ns - wait) / 1000))
