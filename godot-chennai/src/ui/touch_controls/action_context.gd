class_name ActionContext
extends RefCounted
## The one small interface between the ACTION button and the systems that give it something to do
## (decision G-176). A system registers a *source*: a Callable that, asked, returns the candidates
## it offers right now (an `ActionCandidate`, an Array of them, or null). The context asks every
## source, drops the ones that are dead, and picks the best: highest `priority`, then the nearest.
## The button shows that candidate's label and calls its `activate` when pressed.
##
##     rig.controls.action_context.add_source(func() -> Variant:
##         var v := driving.nearest_vehicle()
##         return null if v == null else ActionCandidate.make("GET IN", ActionContext.P_BOARD, 1.2, enter))
##
## Suggested priorities: `P_BOARD` (get in), `P_TALK`, `P_PICK_UP`, `P_HAND_OVER` (a fare waiting
## beats a car beside you), `P_ENTER`. Sources whose owner was freed (invalid Callable) are
## removed. Pure logic, no nodes.

const P_ENTER := 20
const P_BOARD := 30
const P_TALK := 40
const P_PICK_UP := 50
const P_HAND_OVER := 60

signal best_changed(label: String)

var _sources: Array[Callable] = []
var _last_label: String = ""


## Register a source; returns it so it can be removed.
func add_source(source: Callable) -> Callable:
	_sources.append(source)
	return source


func remove_source(source: Callable) -> void:
	_sources.erase(source)


func source_count() -> int:
	return _sources.size()


## Every candidate on offer now, best first.
func candidates() -> Array[ActionCandidate]:
	var all: Array[ActionCandidate] = []
	var dead: Array[Callable] = []
	for s in _sources:
		if not s.is_valid():
			dead.append(s)
			continue
		var got: Variant = s.call()
		if got is ActionCandidate:
			all.append(got as ActionCandidate)
		elif got is Array:
			for item: Variant in got as Array:
				if item is ActionCandidate:
					all.append(item as ActionCandidate)
	for d in dead:
		_sources.erase(d)
	all.sort_custom(func(a: ActionCandidate, b: ActionCandidate) -> bool:
		if a.priority != b.priority:
			return a.priority > b.priority
		return a.distance < b.distance)
	return all


## The candidate the button offers, or null when nothing applies.
func best() -> ActionCandidate:
	var all := candidates()
	var top: ActionCandidate = null if all.is_empty() else all[0]
	var label := "" if top == null else top.label
	if label != _last_label:
		_last_label = label
		best_changed.emit(label)
	return top


## Whether the best candidate can be done now (true when there is none).
func best_enabled() -> bool:
	var b := best()
	return b == null or b.enabled


## The button's label now: the best candidate's, or "" when nothing applies.
func label() -> String:
	var b := best()
	return "" if b == null else b.label


## The button was pressed: runs the best candidate. False when there was none.
func trigger() -> bool:
	var b := best()
	if b == null or not b.activate.is_valid():
		return false
	b.activate.call()
	return true
