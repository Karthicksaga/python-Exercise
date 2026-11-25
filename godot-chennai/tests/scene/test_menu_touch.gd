extends TestCase
## The owner's phone bug (G-490): in the pause menu, title SETTINGS, the controls rows and the Jobs
## list no button answered a finger. Cause: `TouchScroll` replayed a tap as a click in window
## coordinates, so under the phone's stretch (2460x1080 window, 938x412 UI) the click landed at a
## third of the spot. These tests tap through the same path as a phone: `Input.parse_input_event`
## with `InputEventScreenTouch` and `InputEventScreenDrag` in window pixels, so the engine emulates
## the mouse from the touch (both arrive, mouse first) and the window's stretch maps them, in the
## real game (`main.tscn`), at three window setups:
## - 915x412 window, 915x412 UI (scale 1);
## - 2460x1080 window, the project's stretch: a 938x412 UI at 2.62 (the POCO M6 Pro);
## - 2460x1080 window with a 2460x1080 UI (scale 1, a large logical screen).
## A tap may wobble a few pixels and must still press the row under it; a drag past the slop
## scrolls and presses nothing. Every press here is counted on the row's own `pressed` signal, with
## the row's handlers set aside for the tap, so nothing changes in the game but what a test asks.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 180
## Window size, UI size (content scale size).
const SETUPS: Array[Array] = [
	[Vector2i(915, 412), Vector2i(915, 412)],
	[Vector2i(2460, 1080), Vector2i(915, 412)],
	[Vector2i(2460, 1080), Vector2i(2460, 1080)],
]
## A finger is not a mouse: it lands, rolls a few pixels and lifts (in UI units).
const WOBBLE := Vector2(5.0, -4.0)

var _old_size: Vector2i
var _old_content: Vector2i
var _old_sound: String
var _old_weather: String
var _setup_name: String = ""


func before_each() -> void:
	_old_size = tree.root.size
	_old_content = tree.root.content_scale_size
	_old_sound = Sound.settings_path
	_old_weather = Weather.settings_path
	Sound.settings_path = "user://test_menu_touch_save.json"
	Weather.settings_path = "user://test_menu_touch_save.json"


func _restore_window() -> void:
	tree.root.size = _old_size
	tree.root.content_scale_size = _old_content
	tree.paused = false
	Sound.settings_path = _old_sound
	Weather.settings_path = _old_weather
	Sound.suspend()


func _use(setup: Array) -> void:
	var window: Vector2i = setup[0]
	var content: Vector2i = setup[1]
	tree.root.size = window
	tree.root.content_scale_size = content
	await wait_frames(4)
	var ui := tree.root.get_visible_rect().size
	_setup_name = "%dx%d window, UI %dx%d" % [window.x, window.y, roundi(ui.x), roundi(ui.y)]


func _boot() -> Main:
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	var loaded := await wait_until(func() -> bool: return main.state in [&"title", &"failed"], LOAD_FRAMES)
	if not assert_true(loaded and main.state == &"title", "the game loaded (state %s)" % main.state):
		return null
	return main


# --- a finger, through the engine's input path ---------------------------------------------------

## UI units to window pixels (what the phone's touch screen reports).
func _window_px(ui: Vector2) -> Vector2:
	return tree.root.get_final_transform() * ui


func _send(e: InputEvent) -> void:
	Input.parse_input_event(e)
	Input.flush_buffered_events()


func _touch(ui: Vector2, down: bool) -> void:
	var e := InputEventScreenTouch.new()
	e.index = 0
	e.position = _window_px(ui)
	e.pressed = down
	_send(e)


func _drag(from_ui: Vector2, to_ui: Vector2) -> void:
	var e := InputEventScreenDrag.new()
	e.index = 0
	e.position = _window_px(to_ui)
	e.relative = _window_px(to_ui) - _window_px(from_ui)
	_send(e)


## A finger tap at `ui` that rolls `WOBBLE` before it lifts.
func tap(ui: Vector2) -> void:
	_touch(ui, true)
	await wait_frames(1)
	_drag(ui, ui + WOBBLE * 0.5)
	await wait_frames(1)
	_drag(ui + WOBBLE * 0.5, ui + WOBBLE)
	await wait_frames(1)
	_touch(ui + WOBBLE, false)
	await wait_frames(3)


## A finger drag from `from_ui` to `to_ui` in `steps` moves, a frame each, then lifted.
func swipe(from_ui: Vector2, to_ui: Vector2, steps: int = 12) -> void:
	_touch(from_ui, true)
	await wait_frames(1)
	var last := from_ui
	for i in steps:
		var p := from_ui.lerp(to_ui, float(i + 1) / float(steps))
		_drag(last, p)
		last = p
		await wait_frames(1)
	for i in 6:
		await wait_frames(1)  # the finger rests, so the release does not flick
	_touch(to_ui, false)
	await wait_frames(3)


# --- counting presses --------------------------------------------------------------------------

## Where to put the finger on `c`: the middle of the part of it that shows inside its scroll list.
func _spot(c: Control) -> Vector2:
	var r := c.get_global_rect()
	var sc := _scroll_of(c)
	if sc != null:
		r = r.intersection(sc.get_global_rect())
	return r.get_center()


func _scroll_of(c: Node) -> TouchScroll:
	var n := c.get_parent()
	while n != null:
		if n is TouchScroll:
			return n as TouchScroll
		n = n.get_parent()
	return null


## Brings `c` into its list's view (as a drag would), waits for the layout.
func _reveal(c: Control) -> void:
	var sc := _scroll_of(c)
	if sc != null:
		await _settle(sc)
		sc.ensure_control_visible(c)
	await wait_frames(3)


## Waits (in frames) until a flick or bounce of `sc` has come to rest.
func _settle(sc: TouchScroll) -> void:
	check(await wait_until(func() -> bool: return not sc.is_interacting(), 240), "%s: the list comes to rest" % _setup_name)


## A finger tap on `c`, brought into its list's view first.
func press(c: Control) -> void:
	await _reveal(c)
	await tap(_spot(c))


## Taps `b` with its own handlers set aside; returns how many times it was pressed.
func tap_count(b: BaseButton) -> int:
	var saved: Array[Dictionary] = []
	for c: Dictionary in b.pressed.get_connections():
		saved.append(c)
		b.pressed.disconnect(c["callable"] as Callable)
	var n: Array[int] = [0]
	var count := func() -> void: n[0] += 1
	b.pressed.connect(count)
	await press(b)
	b.pressed.disconnect(count)
	for c in saved:
		b.pressed.connect(c["callable"] as Callable, int(c["flags"]))
	return n[0]


## Every button in `buttons` takes one tap and only its own.
func _tap_each(where: String, buttons: Array[BaseButton]) -> void:
	for b in buttons:
		if not b.is_visible_in_tree() or b.disabled:
			continue
		var others: Array[BaseButton] = []
		for o in buttons:
			if o != b:
				others.append(o)
		# Count the neighbours too: a click that lands on the next row is the same bug.
		var hits: Array[int] = [0]
		var stray := func() -> void: hits[0] += 1
		for o in others:
			o.pressed.connect(stray)
		var got := await tap_count(b)
		for o in others:
			o.pressed.disconnect(stray)
		check(got == 1, "%s, %s: a finger tap on %s presses it once (got %d)" % [_setup_name, where, b.name, got])
		check(hits[0] == 0, "%s, %s: the tap on %s pressed nothing else (%d)" % [_setup_name, where, b.name, hits[0]])


## A drag over a list that scrolls moves it and presses no row.
func _drag_scrolls(where: String, sc: TouchScroll, rows: Array[BaseButton]) -> void:
	if sc.max_scroll() <= 0.0:
		return  # it fits: nothing to scroll here
	sc.scroll_vertical = 0
	await wait_frames(3)
	var hits: Array[int] = [0]
	var stray := func() -> void: hits[0] += 1
	for r in rows:
		r.pressed.connect(stray)
	var box := sc.get_global_rect()
	var from := Vector2(box.get_center().x, box.end.y - 12.0)
	var to := from - Vector2(0.0, minf(120.0, box.size.y - 24.0))
	await swipe(from, to)
	for r in rows:
		r.pressed.disconnect(stray)
	check(sc.scroll_vertical > 20, "%s, %s: a finger drag scrolls the list (%d px)" % [_setup_name, where, sc.scroll_vertical])
	check(hits[0] == 0, "%s, %s: the drag pressed no row (%d)" % [_setup_name, where, hits[0]])
	await _settle(sc)
	sc.scroll_vertical = 0
	await wait_frames(3)


func _buttons_in(n: Node) -> Array[BaseButton]:
	var out: Array[BaseButton] = []
	for c: Node in n.find_children("*", "BaseButton", true, false):
		out.append(c as BaseButton)
	return out


# --- the tests ---------------------------------------------------------------------------------

func test_every_menu_row_takes_a_finger_tap_at_phone_scale() -> bool:
	var main := await _boot()
	if main == null:
		_restore_window()
		return true
	for setup in SETUPS:
		await _use(setup)
		# Title: the rows, SETTINGS and its every row, CONTROLS and BACK.
		var title := main.title
		var rows: Array[BaseButton] = []
		for r in title.rows():
			rows.append(r)
		await _tap_each("title", rows)
		await press(title.row("SETTINGS"))
		if check(title.page == TitleMenu.PAGE_SETTINGS, "%s: a tap on SETTINGS opens the page (%s)" % [_setup_name, title.page]):
			var page := title.find_child("SettingsPage", true, false)
			var list := _buttons_in(page.find_child("List", true, false))
			check(list.size() >= 5, "%s: the title settings has its rows (%d)" % [_setup_name, list.size()])
			await _tap_each("title settings", list)
			await _drag_scrolls("title settings", _scroll_of(list[0]), list)
			await press(page.find_child("Back", true, false) as Control)
		check(title.page == TitleMenu.PAGE_MENU, "%s: BACK goes back to the menu" % _setup_name)
		await press(title.row("CONTROLS"))
		if check(title.page == TitleMenu.PAGE_CONTROLS, "%s: a tap on CONTROLS opens the page" % _setup_name):
			await press(title.find_child("ControlsPage", true, false).find_child("Back", true, false) as Control)
		check(title.page == TitleMenu.PAGE_MENU, "%s: CONTROLS' BACK goes back" % _setup_name)
		# Sound really switches from a finger (the owner: "Sound does not work anywhere").
		var sound := title.setting_button(&"Sound")
		title.show_settings()
		await wait_frames(3)
		var was := Sound.enabled
		await _reveal(sound)
		await press(sound)
		check(Sound.enabled != was and AudioServer.is_bus_mute(AudioServer.get_bus_index(&"Master")) == was, "%s: SOUND switches the sound" % _setup_name)
		await press(sound)
		check(Sound.enabled == was, "%s: and back" % _setup_name)
		title.show_menu()
		await wait_frames(3)
	# Play: PAUSE, every pause row, a drag, MAP and its buttons, RESUME; then the Jobs list.
	main.play()
	await wait_physics_frames(5)
	for setup in SETUPS:
		await _use(setup)
		await press(main.pause_menu.pause_button)
		if not check(main.state == &"paused" and main.pause_menu.is_open(), "%s: a tap on PAUSE pauses (%s)" % [_setup_name, main.state]):
			continue
		await wait_frames(3)
		var list := _buttons_in(main.pause_menu.find_child("List", true, false))
		check(list.size() >= 8, "%s: the pause menu has its rows (%d)" % [_setup_name, list.size()])
		await _tap_each("pause", list)
		await _drag_scrolls("pause", _scroll_of(list[0]), list)
		# MAP opens the full map; its buttons take taps; a drag pans as far as the finger, once.
		await press(main.pause_menu.find_child("Map", true, false) as Control)
		var ml := main.find_child("MissionsLayer", false, false) as MissionsLayer
		var map := ml.full_map
		if check(map != null and map.is_open(), "%s: a tap on MAP opens the map" % _setup_name):
			await wait_frames(3)
			var map_buttons: Array[BaseButton] = [map.zoom_in_button, map.zoom_out_button, map.recentre_button, map.close_button]
			await _tap_each("map", map_buttons)
			var centre := map.projection.centre
			var ppm := map.projection.pixels_per_metre
			var mid := tree.root.get_visible_rect().size * 0.5
			await swipe(mid, mid + Vector2(-90.0, 0.0), 6)
			var moved := (map.projection.centre - centre).length() * ppm
			check(absf(moved - 90.0) < 12.0, "%s: the map pans with the finger, once (%.0f px for a 90 px drag)" % [_setup_name, moved])
			await press(map.close_button)
			check(not map.is_open(), "%s: CLOSE closes the map" % _setup_name)
		await press(main.pause_menu.find_child("Resume", true, false) as Control)
		check(main.state == &"play", "%s: a tap on RESUME resumes (%s)" % [_setup_name, main.state])
		await wait_physics_frames(3)
		# The Jobs list: every row's button and the dialog's buttons; CLOSE closes it.
		await press(ml.hud.jobs_button)
		if check(ml.hud.dialog_open(), "%s: a tap on JOBS opens the list" % _setup_name):
			await wait_frames(3)
			var dialog_buttons := _buttons_in(ml.hud.dialog)
			check(dialog_buttons.size() >= 2, "%s: the Jobs list has buttons (%d)" % [_setup_name, dialog_buttons.size()])
			await _tap_each("jobs", dialog_buttons)
			var rows_scroll := _scroll_of(ml.hud.dialog_rows)
			if rows_scroll != null:
				var take: Array[BaseButton] = []
				for b in dialog_buttons:
					if b.name.begins_with("Take_"):
						take.append(b)
				await _drag_scrolls("jobs", rows_scroll, take)
			await press(ml.hud.buttons["close"] as Control)
			check(not ml.hud.dialog_open(), "%s: CLOSE closes the Jobs list" % _setup_name)
			await wait_physics_frames(2)
	_restore_window()
	return true
