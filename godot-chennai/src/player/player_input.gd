class_name PlayerInput
extends RefCounted
## What the player asks for in one physics step, from any device (touch, keyboard, gamepad,
## a test): the controller reads only this (port of the Three.js `PlayerInput`).

## Stick: x right, y forward, each in [-1, 1].
var move: Vector2 = Vector2.ZERO
## True on the step the jump button was pressed.
var jump: bool = false
## Run while moving, whatever the stick's travel (the RUN button, Shift).
var run: bool = false
## Camera heading in radians (0 looks towards -Z, north); movement is relative to it.
var camera_yaw: float = 0.0


static func make(move_: Vector2, camera_yaw_: float = 0.0, jump_: bool = false, run_: bool = false) -> PlayerInput:
	var i := PlayerInput.new()
	i.move = move_
	i.camera_yaw = camera_yaw_
	i.jump = jump_
	i.run = run_
	return i
