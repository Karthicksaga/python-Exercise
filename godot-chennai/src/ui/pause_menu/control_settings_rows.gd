class_name ControlSettingsRows
extends RefCounted
## The controls' rows in the pause menu's settings (decision G-170): each a button showing its
## current value that moves to the next on a press, like the menu's other settings. They edit a
## `ControlSettings` (saved on every change), which the touch controls and the gamepad reader
## watch, so the layout changes while the menu is open. The title's CONTROLS page reads
## `ControlsGuide` instead.

static func add_to(menu: PauseMenu, s: ControlSettings) -> void:
	menu.add_setting(&"LeftHanded", func() -> String: return Tr.t("set.left_handed", [_onoff(s.left_handed)]), func() -> void: s.set_left_handed(not s.left_handed))
	menu.add_setting(&"LookSpeed", func() -> String: return Tr.t("set.look_speed", [String.num(s.look_sensitivity, 2)]), func() -> void: s.set_look_sensitivity(ControlSettings.next_in(ControlSettings.SENSITIVITIES, s.look_sensitivity)))
	menu.add_setting(&"InvertY", func() -> String: return Tr.t("set.invert_y", [_onoff(s.invert_y)]), func() -> void: s.set_invert_y(not s.invert_y))
	menu.add_setting(&"ButtonSize", func() -> String: return Tr.t("set.button_size", [SIZE_KEYS[s.button_size]]), func() -> void: s.set_button_size((s.button_size + 1) % ControlSettings.SIZE_NAMES.size()))
	menu.add_setting(&"ButtonOpacity", func() -> String: return Tr.t("set.button_opacity", [roundi(s.opacity * 100.0)]), func() -> void: s.set_opacity(ControlSettings.next_in(ControlSettings.OPACITIES, s.opacity)))
	menu.add_setting(&"Haptics", func() -> String: return Tr.t("set.vibration", [_onoff(s.haptics)]), func() -> void: s.set_haptics(not s.haptics))
	menu.add_setting(&"RunMode", func() -> String: return Tr.t("set.run", [&"set.run.tap" if s.run_toggle else &"set.run.edge"]), func() -> void: s.set_run_toggle(not s.run_toggle))


## The keys of `ControlSettings.SIZE_NAMES`, in order.
const SIZE_KEYS: Array[StringName] = [&"set.size.small", &"set.size.medium", &"set.size.large"]


static func _onoff(on: bool) -> StringName:
	return &"set.on" if on else &"set.off"
