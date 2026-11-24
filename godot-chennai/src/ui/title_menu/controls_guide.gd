class_name ControlsGuide
extends RefCounted
## What the CONTROLS page lists (G-163): one read-only list of the current touch controls, kept
## in this one place. The controls scheme is being redesigned by another task: when it changes,
## change `groups()` (nothing else on the title knows a control). Each group is
## {"title": String, "rows": Array of [control, what it does]}.

static func groups() -> Array[Dictionary]:
	return [
		{"title": "ON FOOT", "rows": [
			["Left thumb, drag", "Walk. Push to the edge to run"],
			["RUN", "Tap to run; it stops when you let go of the stick"],
			["JUMP", "Jump"],
			["Right side, drag", "Look round"],
			["GET IN", "Appears next to a vehicle: get in"],
		]},
		{"title": "DRIVING", "rows": [
			["Steering pad", "Rest a thumb on it and slide left or right"],
			["GAS / BRAKE", "Hold to speed up or slow down"],
			["D / R / P", "Drive, reverse, park"],
			["HORN", "Horn (siren on the ambulance and police car)"],
			["EXIT", "Get out of the vehicle"],
		]},
		{"title": "ANYWHERE", "rows": [
			["PAUSE", "Pause: resume, change the time, weather or sound, or go to the title"],
			["JOBS", "The job board and your stages"],
			["Keyboard", "WASD or arrows move, Shift runs, Space jumps, Esc goes back"],
		]},
	]
