class_name ControlsGuide
extends RefCounted
## The one data source for "what do the controls do": rows of [control, what it does] for the
## active scheme and device (decision G-179). The pause menu and the title's CONTROLS page both
## read it, so they cannot disagree with the game. Pure data.
##
##     for row in ControlsGuide.rows(ControlsGuide.ON_FOOT, DeviceTracker.Device.PAD):
##         label.text = "%s: %s" % [row[0], row[1]]

const ON_FOOT := &"foot"
const DRIVING := &"driving"


## Rows (Array of two-String Arrays) for `mode` (ON_FOOT or DRIVING) on `device`.
static func rows(mode: StringName, device: DeviceTracker.Device = DeviceTracker.Device.TOUCH, settings: ControlSettings = null) -> Array[PackedStringArray]:
	var s := settings if settings != null else ControlSettings.shared()
	var left := "right" if s.left_handed else "left"
	var right := "left" if s.left_handed else "right"
	var out: Array[PackedStringArray] = []
	if mode == ON_FOOT:
		match device:
			DeviceTracker.Device.PAD:
				out.append(PackedStringArray(["Left stick", "Walk; push to the edge to run"]))
				out.append(PackedStringArray(["Right stick", "Look round"]))
				out.append(PackedStringArray(["A", "Action: get in, talk, pick up, hand over"]))
				out.append(PackedStringArray(["X", "Jump"]))
				out.append(PackedStringArray(["Start", "Pause"]))
			DeviceTracker.Device.KEYBOARD:
				out.append(PackedStringArray(["W A S D", "Walk"]))
				out.append(PackedStringArray(["Shift", "Run"]))
				out.append(PackedStringArray(["E", "Action: get in, talk, pick up, hand over"]))
				out.append(PackedStringArray(["Space", "Jump"]))
				out.append(PackedStringArray(["Mouse drag", "Look round"]))
				out.append(PackedStringArray(["Esc", "Pause"]))
			_:
				out.append(PackedStringArray(["Touch the %s side" % left, "A stick appears: walk; push to the edge to run"] if not s.run_toggle else ["Touch the %s side" % left, "A stick appears: walk; tap RUN to run"]))
				out.append(PackedStringArray(["Drag the %s side" % right, "Look round"]))
				out.append(PackedStringArray(["Big round button", "Action: GET IN, TALK, PICK UP, HAND OVER, ENTER"]))
				out.append(PackedStringArray(["Small button above it", "Jump"]))
	else:
		match device:
			DeviceTracker.Device.PAD:
				out.append(PackedStringArray(["Left stick", "Steer"]))
				out.append(PackedStringArray(["RT", "Gas"]))
				out.append(PackedStringArray(["LT", "Brake; hold when stopped to reverse"]))
				out.append(PackedStringArray(["Y", "Horn (siren on an ambulance or police car)"]))
				out.append(PackedStringArray(["B", "Get out"]))
				out.append(PackedStringArray(["Start", "Pause"]))
			DeviceTracker.Device.KEYBOARD:
				out.append(PackedStringArray(["A D", "Steer"]))
				out.append(PackedStringArray(["W", "Gas"]))
				out.append(PackedStringArray(["S or Space", "Brake; hold when stopped to reverse"]))
				out.append(PackedStringArray(["H", "Horn"]))
				out.append(PackedStringArray(["E", "Get out"]))
				out.append(PackedStringArray(["Esc", "Pause"]))
			_:
				out.append(PackedStringArray(["Slide the %s side" % left, "Steer: touch anywhere, slide sideways; it centres itself"]))
				out.append(PackedStringArray(["GAS", "Accelerate"]))
				out.append(PackedStringArray(["BRAKE", "Brake; hold when stopped to reverse"]))
				out.append(PackedStringArray(["HORN", "Horn (SIREN on an ambulance or police car)"]))
				out.append(PackedStringArray(["EXIT", "Get out when stopped"]))
	return out

## Groups for the title's CONTROLS page (G-163): `{"title": String, "rows": Array of [control, what it does]}`
## for ON FOOT, DRIVING and what applies anywhere, for `device` (touch by default).
static func groups(device: DeviceTracker.Device = DeviceTracker.Device.TOUCH, settings: ControlSettings = null) -> Array[Dictionary]:
	var foot: Array = []
	for r: PackedStringArray in rows(ON_FOOT, device, settings):
		foot.append([r[0], r[1]])
	var drive: Array = []
	for r: PackedStringArray in rows(DRIVING, device, settings):
		drive.append([r[0], r[1]])
	var anywhere: Array = [
		["PAUSE", "Pause: resume, change the time, weather, sound or the controls, or go to the title"],
		["JOBS", "The job board and your stages"],
	]
	return [
		{"title": "ON FOOT", "rows": foot},
		{"title": "DRIVING", "rows": drive},
		{"title": "ANYWHERE", "rows": anywhere},
	]
