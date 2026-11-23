extends Node
## Autoload `GameLoop`: the fixed-step game time (TD-6 of the Three.js game: gameplay and
## physics in 1/60 s steps, decision G-2).
##
## Counts physics frames and game seconds while the tree runs (both stop while paused) and
## advances the time of day. Tests and gameplay wait in game time through this service, never
## on the wall clock: a slow CI runner or phone then gives the same results, only later.

## Emitted after every physics step with the step's length in seconds.
signal ticked(step: float)

## Physics frames since start (or the last `reset()`).
var physics_frames: int = 0
## Game seconds since start: the sum of physics steps, so it stops while paused.
var game_seconds: float = 0.0
## Time of day, advanced by the steps.
var clock: GameClock = GameClock.new()


func _physics_process(delta: float) -> void:
	physics_frames += 1
	game_seconds += delta
	clock.advance(delta)
	ticked.emit(delta)


func reset() -> void:
	physics_frames = 0
	game_seconds = 0.0
	clock = GameClock.new()


## Resumes after `count` more physics frames have run.
func wait_physics_frames(count: int) -> void:
	var target := physics_frames + count
	while physics_frames < target:
		await ticked


## Resumes once `seconds` more game seconds have passed (whole physics steps, so at least that long).
func wait_game_seconds(seconds: float) -> void:
	var target := game_seconds + seconds - 0.0000001
	while game_seconds < target:
		await ticked
