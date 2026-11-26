class_name MapPrototype
extends Control
## Interactive Map UI/UX Prototype for Chennai Open World (Phase 2).
## Runs completely standalone (`res://src/map_prototype/map_prototype.tscn`) and reads existing
## OSM world data in read-only mode without modifying any main-game scenes, saves, or files.

const PLAYER_START := Vector2(40.0, 60.0)  # Anna Nagar spawn (WorldOrigin reference)
const BOOKMARKS_PATH := "user://map_prototype_bookmarks.json"
const LAYER_DEFS: Array[Array] = [
	[&"normal", "Normal Map (Roads & Coast)"],
	[&"road_names", "Road Names"],
	[&"buildings", "Buildings (Detailed Zoom)"],
	[&"localities", "Localities (EN / தமிழ்)"],
	[&"landmarks", "Landmarks & POIs"],
	[&"railway", "Railway Lines & Stations"],
	[&"metro", "Metro (No OSM Tracks Yet)"],
	[&"parks", "Parks & Green Cover"],
	[&"water", "Water Bodies & Canals"],
	[&"missions", "Missions [SAMPLE]"],
	[&"route", "Player Route"],
]

var data := PrototypeWorldData.new()
var _font: Font

var canvas: PrototypeMapCanvas
var minimap: PrototypeMinimap

## Top Bar Controls
var search_edit: LineEdit
var search_clear_btn: Button
var route_toggle_btn: Button
var saved_toggle_btn: Button
var measure_toggle_btn: Button
var layers_toggle_btn: Button
var sim_drive_btn: Button
var zoom_in_btn: Button
var zoom_out_btn: Button
var me_btn: Button
var reset_btn: Button

## Search Dropdown
var search_panel: PanelContainer
var search_list: VBoxContainer

## Saved Places / Bookmarks Drawer (top-right)
var saved_panel: PanelContainer
var saved_list: VBoxContainer

## Place Inspector (bottom-left)
var inspector_panel: PanelContainer
var inspector_title: Label
var inspector_sub: Label
var inspector_coords: Label
var inspector_nearby: Label
var inspector_start_btn: Button
var inspector_dest_btn: Button
var inspector_wp_btn: Button
var inspector_save_btn: Button
var inspector_copy_btn: Button
var inspector_clear_btn: Button

## Route Planner Drawer (left)
var route_panel: PanelContainer
var stops_box: VBoxContainer
var route_summary_label: Label
var route_steps_box: VBoxContainer
var route_mode_btn: Button
var start_nav_btn: Button
var clear_route_btn: Button

## Layers Drawer (right)
var layers_panel: PanelContainer
var layer_checks: Dictionary[StringName, CheckBox] = {}
var layer_note_label: Label

## Street-Entry Notification Banner (top-centre)
var banner_panel: PanelContainer
var banner_tag: Label
var banner_title: Label
var banner_sub: Label
var _banner_timer := 0.0

## Active Navigation HUD
var nav_panel: PanelContainer
var nav_dist_label: Label
var nav_turn_label: Label
var nav_road_label: Label
var nav_next_label: Label
var nav_eta_label: Label
var nav_offroute_btn: Button
var nav_end_btn: Button

## Prototype Mode Badge
var status_pill: PanelContainer
var status_label: Label

## Routing & Simulation State
var start_stop: Dictionary = {"role": "start", "name": "Current Position (Anna Nagar)", "pos": PLAYER_START, "is_player": true}
var waypoints: Array[Dictionary] = []
var dest_stop: Dictionary = {}
var current_route: Dictionary = {}
var route_mode: String = "fastest"  # "fastest" or "shortest"
var selected_place: Dictionary = {}
var bookmarks: Array[Dictionary] = []
var pick_mode: String = ""  # "", "start", "dest", "waypoint", "measure"

var navigating := false
var sim_driving := false
var _sim_progress_m := 0.0
var _sim_offroute_offset := Vector2.ZERO
var _last_street_name := ""
var _last_locality_name := ""
var _street_check_accum := 0.0
var _banner_seq := 0


func _ready() -> void:
	theme = UiTheme.get_theme()
	_font = RailFonts.with_tamil()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_build_ui()
	_load_world_data()
	_apply_cli_demo()


func _build_ui() -> void:
	canvas = PrototypeMapCanvas.new()
	canvas.name = "MapCanvas"
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.data = data
	canvas.map_tapped.connect(_on_map_tapped)
	canvas.view_changed.connect(_on_view_changed)
	add_child(canvas)

	var margin := SafeAreaMargin.new()
	margin.name = "SafeArea"
	margin.gutter = 12
	add_child(margin)

	var overlay := Control.new()
	overlay.name = "Overlay"
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(overlay)

	_build_top_bar(overlay)
	_build_search_dropdown(overlay)
	_build_saved_drawer(overlay)
	_build_street_banner(overlay)
	_build_route_drawer(overlay)
	_build_layers_drawer(overlay)
	_build_inspector(overlay)
	_build_nav_hud(overlay)
	_build_status_pill(overlay)


func _build_top_bar(parent: Control) -> void:
	var bar_panel := PanelContainer.new()
	bar_panel.name = "TopBar"
	bar_panel.anchor_right = 1.0
	bar_panel.offset_bottom = 52.0
	bar_panel.add_theme_stylebox_override("panel", _glass_panel(0.86, 10))
	parent.add_child(bar_panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	bar_panel.add_child(row)

	var title_lbl := _make_label("CHENNAI MAP", 14, UiTheme.AMBER)
	row.add_child(title_lbl)

	search_edit = LineEdit.new()
	search_edit.name = "SearchInput"
	search_edit.placeholder_text = "Search streets, localities, GPS (lat, lng)..."
	search_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	search_edit.custom_minimum_size = Vector2(140, 36)
	search_edit.add_theme_font_override("font", _font)
	search_edit.add_theme_font_size_override("font_size", 13)
	search_edit.text_changed.connect(_on_search_changed)
	search_edit.focus_entered.connect(func() -> void: _refresh_search_results(search_edit.text))
	row.add_child(search_edit)

	search_clear_btn = _bar_btn("×", "ClearSearch", 32, func() -> void:
		search_edit.text = ""
		search_panel.visible = false
	)
	row.add_child(search_clear_btn)

	route_toggle_btn = _bar_btn("ROUTE", "RouteBtn", 64, _toggle_route_drawer)
	row.add_child(route_toggle_btn)

	saved_toggle_btn = _bar_btn("★ SAVED", "SavedBtn", 72, _toggle_saved_drawer)
	row.add_child(saved_toggle_btn)

	measure_toggle_btn = _bar_btn("RULER", "MeasureBtn", 64, _toggle_measure_mode)
	row.add_child(measure_toggle_btn)

	layers_toggle_btn = _bar_btn("LAYERS", "LayersBtn", 68, _toggle_layers_drawer)
	row.add_child(layers_toggle_btn)

	sim_drive_btn = _bar_btn("SIM", "SimDriveBtn", 48, _toggle_sim_drive)
	row.add_child(sim_drive_btn)

	zoom_in_btn = _bar_btn("+", "ZoomInBtn", 34, func() -> void: canvas.zoom_by(0.62))
	row.add_child(zoom_in_btn)

	zoom_out_btn = _bar_btn("-", "ZoomOutBtn", 34, func() -> void: canvas.zoom_by(1.6))
	row.add_child(zoom_out_btn)

	me_btn = _bar_btn("ME", "MeBtn", 40, func() -> void: canvas.focus_on(canvas.player_pos, 1400.0))
	row.add_child(me_btn)

	reset_btn = _bar_btn("RESET", "ResetBtn", 58, _reset_prototype)
	row.add_child(reset_btn)


func _build_search_dropdown(parent: Control) -> void:
	search_panel = PanelContainer.new()
	search_panel.name = "SearchResults"
	search_panel.visible = false
	search_panel.offset_left = 100.0
	search_panel.offset_top = 58.0
	search_panel.offset_right = 520.0
	search_panel.offset_bottom = 320.0
	search_panel.add_theme_stylebox_override("panel", _glass_panel(0.94, 10))
	parent.add_child(search_panel)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	search_panel.add_child(scroll)

	search_list = VBoxContainer.new()
	search_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	search_list.add_theme_constant_override("separation", 4)
	scroll.add_child(search_list)


func _build_street_banner(parent: Control) -> void:
	banner_panel = PanelContainer.new()
	banner_panel.name = "StreetBanner"
	banner_panel.visible = false
	banner_panel.anchor_left = 0.5
	banner_panel.anchor_right = 0.5
	banner_panel.offset_left = -190.0
	banner_panel.offset_right = 190.0
	banner_panel.offset_top = 60.0
	banner_panel.offset_bottom = 118.0
	banner_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner_panel.add_theme_stylebox_override("panel", _glass_panel(0.92, 12, Color("#ffb703")))
	parent.add_child(banner_panel)

	var vb := VBoxContainer.new()
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_theme_constant_override("separation", 1)
	banner_panel.add_child(vb)

	banner_tag = _make_label("ENTERING STREET", 10, UiTheme.AMBER)
	banner_tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(banner_tag)

	banner_title = _make_label("ANNA NAGAR 2ND AVENUE", 15, UiTheme.TEXT)
	banner_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(banner_title)

	banner_sub = _make_label("Anna Nagar, Chennai", 12, UiTheme.TEXT_DIM)
	banner_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(banner_sub)


func _build_route_drawer(parent: Control) -> void:
	route_panel = PanelContainer.new()
	route_panel.name = "RouteDrawer"
	route_panel.visible = false
	route_panel.anchor_bottom = 1.0
	route_panel.offset_top = 60.0
	route_panel.offset_bottom = -42.0
	route_panel.offset_right = 310.0
	route_panel.add_theme_stylebox_override("panel", _glass_panel(0.92, 12))
	parent.add_child(route_panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	route_panel.add_child(vb)

	var hdr := HBoxContainer.new()
	vb.add_child(hdr)
	hdr.add_child(_make_label("ROUTE PLANNER", 14, UiTheme.AMBER))
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hdr.add_child(sp)
	hdr.add_child(_bar_btn("×", "CloseRoute", 30, func() -> void: route_panel.visible = false))

	var quick_row := HBoxContainer.new()
	quick_row.add_theme_constant_override("separation", 4)
	vb.add_child(quick_row)
	quick_row.add_child(_bar_btn("Demo", "DemoRouteBtn", 62, _load_sample_multi_stop_route))
	quick_row.add_child(_bar_btn("⇄ Swap", "SwapRouteBtn", 64, _swap_start_dest))
	route_mode_btn = _bar_btn("Fastest", "RouteModeBtn", 74, _toggle_route_mode)
	quick_row.add_child(route_mode_btn)
	quick_row.add_child(_bar_btn("Pick", "PickDestBtn", 54, func() -> void:
		pick_mode = "dest"
		_set_status("Tap anywhere on the map to set Destination")
	))

	stops_box = VBoxContainer.new()
	stops_box.add_theme_constant_override("separation", 4)
	vb.add_child(stops_box)

	route_summary_label = _make_label("Select Destination to preview route.", 12, UiTheme.TEXT_DIM)
	route_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(route_summary_label)

	var steps_scroll := ScrollContainer.new()
	steps_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	steps_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	vb.add_child(steps_scroll)

	route_steps_box = VBoxContainer.new()
	route_steps_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	route_steps_box.add_theme_constant_override("separation", 3)
	steps_scroll.add_child(route_steps_box)

	var act := HBoxContainer.new()
	act.add_theme_constant_override("separation", 6)
	vb.add_child(act)
	start_nav_btn = _bar_btn("START NAVIGATION", "StartNavBtn", 165, _start_navigation)
	start_nav_btn.disabled = true
	act.add_child(start_nav_btn)
	clear_route_btn = _bar_btn("CLEAR", "ClearRouteBtn", 70, _clear_route)
	act.add_child(clear_route_btn)


func _build_layers_drawer(parent: Control) -> void:
	layers_panel = PanelContainer.new()
	layers_panel.name = "LayersDrawer"
	layers_panel.visible = false
	layers_panel.anchor_left = 1.0
	layers_panel.anchor_right = 1.0
	layers_panel.anchor_bottom = 1.0
	layers_panel.offset_left = -255.0
	layers_panel.offset_top = 60.0
	layers_panel.offset_bottom = -42.0
	layers_panel.add_theme_stylebox_override("panel", _glass_panel(0.92, 12))
	parent.add_child(layers_panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 4)
	layers_panel.add_child(vb)

	var hdr := HBoxContainer.new()
	vb.add_child(hdr)
	hdr.add_child(_make_label("MAP LAYERS", 14, UiTheme.AMBER))
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hdr.add_child(sp)
	hdr.add_child(_bar_btn("×", "CloseLayers", 30, func() -> void:
		layers_panel.visible = false
		minimap.visible = true
	))

	var sc := ScrollContainer.new()
	sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	vb.add_child(sc)

	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 2)
	sc.add_child(list)

	for pair: Array in LAYER_DEFS:
		var lid: StringName = pair[0]
		var lname := str(pair[1])
		var cb := CheckBox.new()
		cb.text = lname
		cb.button_pressed = canvas.layers.get(lid, true)
		cb.add_theme_font_override("font", _font)
		cb.add_theme_font_size_override("font_size", 12)
		cb.add_theme_color_override("font_color", UiTheme.TEXT)
		cb.add_theme_color_override("font_pressed_color", UiTheme.AMBER)
		cb.add_theme_color_override("font_hover_color", UiTheme.TEXT)
		cb.add_theme_color_override("font_hover_pressed_color", UiTheme.AMBER)
		var cb_box := _glass_panel(0.45, 6, Color(1, 1, 1, 0.12))
		for st_name: String in ["normal", "hover", "pressed", "hover_pressed", "focus"]:
			cb.add_theme_stylebox_override(st_name, cb_box)
		cb.toggled.connect(func(on: bool) -> void:
			canvas.layers[lid] = on
			canvas.queue_redraw()
			_update_layer_note()
		)
		layer_checks[lid] = cb
		list.add_child(cb)

	layer_note_label = _make_label("Metro tracks are not in current OSM rail extract; suburban/MRTS tracks are real.", 11, UiTheme.TEXT_DIM)
	layer_note_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(layer_note_label)


func _build_saved_drawer(parent: Control) -> void:
	saved_panel = PanelContainer.new()
	saved_panel.name = "SavedDrawer"
	saved_panel.visible = false
	saved_panel.anchor_left = 1.0
	saved_panel.anchor_right = 1.0
	saved_panel.offset_left = -295.0
	saved_panel.offset_right = -4.0
	saved_panel.offset_top = 60.0
	saved_panel.offset_bottom = 320.0
	saved_panel.add_theme_stylebox_override("panel", _glass_panel(0.94, 12))
	parent.add_child(saved_panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 4)
	saved_panel.add_child(vb)

	var hdr := HBoxContainer.new()
	vb.add_child(hdr)
	hdr.add_child(_make_label("★ SAVED PLACES", 13, UiTheme.AMBER))
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hdr.add_child(sp)
	hdr.add_child(_bar_btn("×", "CloseSaved", 28, func() -> void: saved_panel.visible = false))

	var sc := ScrollContainer.new()
	sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	vb.add_child(sc)

	saved_list = VBoxContainer.new()
	saved_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	saved_list.add_theme_constant_override("separation", 4)
	sc.add_child(saved_list)


func _build_inspector(parent: Control) -> void:
	inspector_panel = PanelContainer.new()
	inspector_panel.name = "PlaceInspector"
	inspector_panel.visible = false
	inspector_panel.anchor_top = 1.0
	inspector_panel.anchor_bottom = 1.0
	inspector_panel.offset_top = -188.0
	inspector_panel.offset_bottom = -42.0
	inspector_panel.offset_right = 382.0
	inspector_panel.add_theme_stylebox_override("panel", _glass_panel(0.94, 12))
	parent.add_child(inspector_panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 3)
	inspector_panel.add_child(vb)

	inspector_title = _make_label("Selected Place", 14, UiTheme.AMBER)
	vb.add_child(inspector_title)
	inspector_sub = _make_label("Category · Locality", 12, UiTheme.TEXT)
	vb.add_child(inspector_sub)
	inspector_coords = _make_label("13.0850, 80.2101", 11, UiTheme.TEXT_DIM)
	vb.add_child(inspector_coords)
	inspector_nearby = _make_label("Nearby (500m): --", 11, Color("#93e2ff"))
	inspector_nearby.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(inspector_nearby)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	vb.add_child(row)
	inspector_start_btn = _bar_btn("Start", "SetStartBtn", 54, _use_selected_as_start)
	inspector_dest_btn = _bar_btn("Dest", "SetDestBtn", 52, _use_selected_as_dest)
	inspector_wp_btn = _bar_btn("+ Wp", "AddWpBtn", 52, _use_selected_as_waypoint)
	inspector_save_btn = _bar_btn("★ Save", "SavePinBtn", 68, _toggle_bookmark_selected)
	inspector_copy_btn = _bar_btn("Copy", "CopyGpsBtn", 50, _copy_selected_coords)
	inspector_clear_btn = _bar_btn("×", "ClearPinBtn", 32, func() -> void:
		selected_place = {}
		canvas.selected_pin = {}
		inspector_panel.visible = false
		canvas.queue_redraw()
	)
	row.add_child(inspector_start_btn)
	row.add_child(inspector_dest_btn)
	row.add_child(inspector_wp_btn)
	row.add_child(inspector_save_btn)
	row.add_child(inspector_copy_btn)
	row.add_child(inspector_clear_btn)


func _build_nav_hud(parent: Control) -> void:
	nav_panel = PanelContainer.new()
	nav_panel.name = "NavHud"
	nav_panel.visible = false
	nav_panel.offset_top = 60.0
	nav_panel.offset_right = 264.0
	nav_panel.offset_bottom = 205.0
	nav_panel.add_theme_stylebox_override("panel", _glass_panel(0.94, 12, Color("#38bdf8")))
	parent.add_child(nav_panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 3)
	nav_panel.add_child(vb)

	var top_r := HBoxContainer.new()
	vb.add_child(top_r)
	nav_dist_label = _make_label("IN 300 M", 16, UiTheme.AMBER)
	top_r.add_child(nav_dist_label)
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_r.add_child(sp)
	nav_turn_label = _make_label("TURN LEFT", 14, Color("#38bdf8"))
	top_r.add_child(nav_turn_label)

	nav_road_label = _make_label("Poonamallee High Road", 14, UiTheme.TEXT)
	vb.add_child(nav_road_label)
	nav_next_label = _make_label("Now: Anna Nagar 2nd Avenue · Anna Nagar", 11, UiTheme.TEXT_DIM)
	vb.add_child(nav_next_label)
	nav_eta_label = _make_label("Remaining: 4.5 km · EST. 9 min", 12, Color("#7ee787"))
	vb.add_child(nav_eta_label)

	var btns := HBoxContainer.new()
	btns.add_theme_constant_override("separation", 5)
	vb.add_child(btns)
	nav_offroute_btn = _bar_btn("Test Off-Route", "OffRouteBtn", 112, _trigger_offroute_test)
	nav_end_btn = _bar_btn("End Nav", "EndNavBtn", 74, _stop_navigation)
	btns.add_child(nav_offroute_btn)
	btns.add_child(nav_end_btn)

	minimap = PrototypeMinimap.new()
	minimap.name = "MinimapPreview"
	minimap.data = data
	minimap.anchor_left = 1.0
	minimap.anchor_right = 1.0
	minimap.anchor_top = 1.0
	minimap.anchor_bottom = 1.0
	minimap.offset_left = -PrototypeMinimap.PLATE - 8.0
	minimap.offset_right = -8.0
	minimap.offset_top = -PrototypeMinimap.PLATE - 36.0
	minimap.offset_bottom = -12.0
	parent.add_child(minimap)


func _build_status_pill(parent: Control) -> void:
	status_pill = PanelContainer.new()
	status_pill.name = "StatusPill"
	status_pill.anchor_left = 1.0
	status_pill.anchor_right = 1.0
	status_pill.anchor_top = 1.0
	status_pill.anchor_bottom = 1.0
	status_pill.offset_left = -456.0
	status_pill.offset_right = -154.0
	status_pill.offset_top = -32.0
	status_pill.offset_bottom = -4.0
	status_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	status_pill.add_theme_stylebox_override("panel", _glass_panel(0.78, 8))
	parent.add_child(status_pill)

	status_label = _make_label("PROTOTYPE · Read-only OSM · Sim Drive & ETA", 11, UiTheme.TEXT_DIM)
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_pill.add_child(status_label)


func _load_world_data() -> void:
	var err := data.open_readonly()
	if err != "":
		_set_status("Error loading world: " + err)
		return
	_load_bookmarks()
	canvas.focus_on(PLAYER_START, 1800.0)
	_update_street_and_locality(true)
	minimap.update_state(canvas.player_pos, canvas.player_heading, PackedVector2Array(), _last_street_name)
	_set_status("PROTOTYPE · %d POIs · %d Districts · Read-only OSM" % [data.all_pois.size(), data.all_districts.size()])


func _process(dt: float) -> void:
	if _banner_timer > 0.0:
		_banner_timer -= dt
		if _banner_timer <= 0.0:
			banner_panel.visible = false

	if sim_driving and navigating and not current_route.is_empty() and bool(current_route.get("ok", false)):
		_step_simulated_drive(dt)


func _step_simulated_drive(dt: float) -> void:
	var poly: PackedVector2Array = current_route.get("polyline", PackedVector2Array())
	if poly.size() < 2:
		return
	_sim_progress_m += dt * 42.0  # brisk prototype simulation speed (42 m/s)
	var sample := _sample_polyline(poly, _sim_progress_m)
	var pos: Vector2 = sample["pos"] + _sim_offroute_offset
	var dir: Vector2 = sample["dir"]
	canvas.player_pos = pos
	canvas.player_heading = atan2(-dir.x, -dir.y)
	canvas.focus_on(pos)

	# Decay offroute check & test automatic A* recalculation when >= 65m away from route
	var dist_to_route := _distance_to_polyline(pos, poly)
	if dist_to_route > 65.0:
		_sim_offroute_offset = Vector2.ZERO
		_recalculate_from_player()
		return

	_street_check_accum += dt
	if _street_check_accum >= 0.25:
		_street_check_accum = 0.0
		_update_street_and_locality(false)

	_update_nav_hud(sample["remaining"])
	minimap.update_state(canvas.player_pos, canvas.player_heading, poly, _last_street_name)

	if float(sample["remaining"]) <= 8.0:
		sim_driving = false
		sim_drive_btn.text = "SIM DRIVE"
		_show_banner("ARRIVED", str(dest_stop.get("name", "Destination")), "Navigation complete [SIMULATED DRIVE]", 3.5)


func _update_street_and_locality(silent: bool) -> void:
	var loc := data.identify_locality(canvas.player_pos)
	var loc_name := str(loc.get("name", "Chennai"))
	var loc_ta := str(loc.get("name_ta", ""))
	var street := data.identify_street(canvas.player_pos, _last_street_name)
	var sname := str(street.get("name", ""))
	if sname == "":
		var ref := str(street.get("ref", ""))
		sname = ref if ref != "" else "Unnamed Street"

	if loc_name != _last_locality_name:
		_last_locality_name = loc_name
		if not silent:
			var sub := "%s · CHENNAI" % loc_ta if loc_ta != "" else "CHENNAI"
			_show_banner("ENTERING LOCALITY", loc_name.to_upper(), sub, 3.2)
	if sname != _last_street_name:
		_last_street_name = sname
		if not silent:
			var area_sub := "%s (%s), Chennai" % [loc_name, loc_ta] if loc_ta != "" else "%s, Chennai" % loc_name
			_show_banner("ENTERING STREET", sname.to_upper(), area_sub, 3.0)


func _show_banner(tag: String, title: String, sub: String, duration: float) -> void:
	_banner_seq += 1
	banner_tag.text = tag
	banner_title.text = title
	banner_sub.text = sub
	if nav_panel.visible:
		banner_panel.anchor_left = 0.0
		banner_panel.anchor_right = 0.0
		banner_panel.offset_left = 276.0
		banner_panel.offset_right = 600.0
	else:
		banner_panel.anchor_left = 0.5
		banner_panel.anchor_right = 0.5
		banner_panel.offset_left = -185.0
		banner_panel.offset_right = 185.0
	banner_panel.visible = true
	_banner_timer = duration


func _on_search_changed(text: String) -> void:
	_refresh_search_results(text)


func _refresh_search_results(query: String) -> void:
	for ch in search_list.get_children():
		ch.queue_free()
	var hits := data.search(query, canvas.player_pos, 18)
	if hits.is_empty():
		var none := _make_label("No offline matches for '%s'" % query, 12, UiTheme.TEXT_DIM)
		search_list.add_child(none)
		search_panel.visible = true
		return
	for h: Dictionary in hits:
		var btn := Button.new()
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.custom_minimum_size = Vector2(0, 38)
		btn.add_theme_font_override("font", _font)
		btn.add_theme_font_size_override("font_size", 12)
		var nm := str(h["name"])
		var ta := str(h.get("name_ta", ""))
		var dist_str := MapProjection.distance_text(float(h["distance"]))
		var title_part := "%s (%s)" % [nm, ta] if ta != "" else nm
		btn.text = "%s  ·  %s · %s · %s" % [title_part, str(h["category"]), str(h["locality"]), dist_str]
		btn.pressed.connect(_on_search_result_picked.bind(h))
		search_list.add_child(btn)
	search_panel.visible = true


func _on_search_result_picked(item: Dictionary) -> void:
	search_panel.visible = false
	var pos: Vector2 = item["pos"]
	if item.has("road_name") and item.has("tile"):
		pos = data.resolve_road_position(str(item["road_name"]), item["tile"] as Vector2i)
	var picked := item.duplicate()
	picked["pos"] = pos
	_select_place(picked)
	canvas.focus_on(pos, 1200.0)


func _on_map_tapped(world_pos: Vector2) -> void:
	search_panel.visible = false
	if pick_mode == "measure":
		if canvas.measure_points.size() >= 2:
			canvas.measure_points.clear()
		canvas.measure_points.append(world_pos)
		canvas.queue_redraw()
		if canvas.measure_points.size() == 1:
			_set_status("RULER · Point A set — tap Point B to measure")
		else:
			var br := PrototypeWorldData.compass_bearing(canvas.measure_points[0], canvas.measure_points[1])
			_set_status("RULER · %s · %s %d° (tap again for new)" % [MapProjection.distance_text(float(br["distance"])), str(br["cardinal"]), int(br["deg"])])
		return
	if pick_mode == "start":
		pick_mode = ""
		start_stop = {"role": "start", "name": _describe_point(world_pos), "pos": world_pos, "is_player": false}
		_rebuild_stops_ui()
		_compute_and_show_route()
		return
	if pick_mode == "dest":
		pick_mode = ""
		dest_stop = {"role": "dest", "name": _describe_point(world_pos), "pos": world_pos}
		route_panel.visible = true
		_rebuild_stops_ui()
		_compute_and_show_route()
		return

	# Hit-test nearby landmark/station/POI first, else inspect tapped street/location.
	var hit := _find_nearest_clickable(world_pos)
	if hit.is_empty():
		var st := data.identify_street(world_pos)
		var sname := str(st.get("name", ""))
		var loc := data.identify_locality(world_pos)
		hit = {
			"name": sname if sname != "" else "Pinned Location",
			"name_ta": str(loc.get("name_ta", "")),
			"category": "Map Pin",
			"locality": str(loc.get("name", "Chennai")),
			"pos": world_pos,
			"distance": world_pos.distance_to(canvas.player_pos),
		}
	_select_place(hit)


func _find_nearest_clickable(world_pos: Vector2) -> Dictionary:
	var thresh := maxf(28.0, canvas.view_height_metres * 0.028)
	var best_d := thresh
	var best: Dictionary = {}
	for lm: Landmark in data.source.get_landmarks():
		var d := lm.position.distance_to(world_pos)
		if d < best_d:
			best_d = d
			best = {"name": lm.name, "name_ta": "", "category": "Landmark", "locality": data.identify_locality_name(lm.position), "pos": lm.position, "distance": lm.position.distance_to(canvas.player_pos)}
	for st: Dictionary in data.rail_stations:
		var sp: Vector2 = st["pos"]
		var d := sp.distance_to(world_pos)
		if d < best_d:
			best_d = d
			best = {"name": str(st["name"]) + " Station", "name_ta": str(st["name_ta"]), "category": "Railway Station", "locality": data.identify_locality_name(sp), "pos": sp, "distance": sp.distance_to(canvas.player_pos)}
	for p: Dictionary in data.all_pois:
		var pp: Vector2 = p["pos"]
		var d := pp.distance_to(world_pos)
		if d < best_d:
			best_d = d
			best = {"name": str(p["name"]), "name_ta": "", "category": str(p["kind"]).capitalize(), "locality": data.identify_locality_name(pp), "pos": pp, "distance": pp.distance_to(canvas.player_pos)}
	return best


func _describe_point(pos: Vector2) -> String:
	var st := data.identify_street(pos)
	var sname := str(st.get("name", ""))
	var loc := data.identify_locality_name(pos)
	if sname != "":
		return "%s (%s)" % [sname, loc]
	return loc


func _select_place(item: Dictionary) -> void:
	selected_place = item
	canvas.selected_pin = item
	var nm := str(item.get("name", "Location"))
	var ta := str(item.get("name_ta", ""))
	inspector_title.text = "%s · %s" % [nm, ta] if ta != "" else nm
	var wp: Vector2 = item["pos"]
	var br := PrototypeWorldData.compass_bearing(canvas.player_pos, wp)
	var dist := MapProjection.distance_text(float(br["distance"]))
	inspector_sub.text = "%s · %s · %s %s (%d°)" % [str(item.get("category", "Place")), str(item.get("locality", "Chennai")), dist, str(br["cardinal"]), int(br["deg"])]
	var ll := data.to_latlng(wp)
	inspector_coords.text = "%.5f°N, %.5f°E · world (%.0f, %.0f) m" % [ll.x, ll.y, wp.x, wp.y]
	var nearby := data.find_nearby_pois(wp, 500.0, 3)
	if nearby.is_empty():
		inspector_nearby.text = "Nearby (500m): None mapped"
	else:
		var names: Array[String] = []
		for nb: Dictionary in nearby:
			names.append("%s (%dm)" % [str(nb["name"]), roundi(float(nb["dist"]))])
		inspector_nearby.text = "Nearby (500m): " + " · ".join(names)
	inspector_save_btn.text = "★ Saved" if _is_bookmarked(nm) else "★ Save"
	inspector_panel.visible = true
	canvas.queue_redraw()


func _use_selected_as_start() -> void:
	if selected_place.is_empty():
		return
	start_stop = {"role": "start", "name": str(selected_place["name"]), "pos": selected_place["pos"], "is_player": false}
	route_panel.visible = true
	_rebuild_stops_ui()
	_compute_and_show_route()


func _use_selected_as_dest() -> void:
	if selected_place.is_empty():
		return
	dest_stop = {"role": "dest", "name": str(selected_place["name"]), "pos": selected_place["pos"]}
	route_panel.visible = true
	_rebuild_stops_ui()
	_compute_and_show_route()


func _use_selected_as_waypoint() -> void:
	if selected_place.is_empty():
		return
	waypoints.append({"role": "waypoint", "name": str(selected_place["name"]), "pos": selected_place["pos"]})
	route_panel.visible = true
	_rebuild_stops_ui()
	_compute_and_show_route()


func _rebuild_stops_ui() -> void:
	for ch in stops_box.get_children():
		ch.queue_free()

	var stops_preview: Array[Dictionary] = [start_stop]
	var start_row := HBoxContainer.new()
	start_row.add_theme_constant_override("separation", 4)
	stops_box.add_child(start_row)
	start_row.add_child(_make_label("A: " + str(start_stop["name"]), 12, Color("#46d17a")))
	var sp0 := Control.new()
	sp0.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	start_row.add_child(sp0)
	start_row.add_child(_bar_btn("ME", "StartMeBtn", 36, func() -> void:
		start_stop = {"role": "start", "name": "Current Position", "pos": canvas.player_pos, "is_player": true}
		_rebuild_stops_ui()
		_compute_and_show_route()
	))
	start_row.add_child(_bar_btn("Map", "StartPickBtn", 42, func() -> void:
		pick_mode = "start"
		_set_status("Tap anywhere on the map to set Start")
	))

	for i in waypoints.size():
		var wp := waypoints[i]
		stops_preview.append(wp)
		var wr := HBoxContainer.new()
		wr.add_theme_constant_override("separation", 4)
		stops_box.add_child(wr)
		wr.add_child(_make_label("W%d: %s" % [i + 1, str(wp["name"])], 12, Color("#38bdf8")))
		var spw := Control.new()
		spw.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		wr.add_child(spw)
		var idx := i
		wr.add_child(_bar_btn("×", "RemWp%d" % i, 28, func() -> void:
			waypoints.remove_at(idx)
			_rebuild_stops_ui()
			_compute_and_show_route()
		))

	if not dest_stop.is_empty():
		stops_preview.append(dest_stop)
	var dest_row := HBoxContainer.new()
	dest_row.add_theme_constant_override("separation", 4)
	stops_box.add_child(dest_row)
	var dtext := "B: " + str(dest_stop["name"]) if not dest_stop.is_empty() else "B: (Tap map or search)"
	dest_row.add_child(_make_label(dtext, 12, UiTheme.AMBER))
	canvas.stops = stops_preview
	canvas.queue_redraw()


func _compute_and_show_route() -> void:
	for ch in route_steps_box.get_children():
		ch.queue_free()
	if dest_stop.is_empty():
		canvas.route_polyline = PackedVector2Array()
		start_nav_btn.disabled = true
		route_summary_label.text = "Select Destination to compute real OSM A* route."
		canvas.queue_redraw()
		return

	var stops: Array[Dictionary] = [start_stop]
	for w: Dictionary in waypoints:
		stops.append(w)
	stops.append(dest_stop)

	var t0 := Time.get_ticks_msec()
	current_route = PrototypeRouter.compute_route(data, stops, route_mode)
	var elapsed_ms := Time.get_ticks_msec() - t0

	if not bool(current_route.get("ok", false)):
		canvas.route_polyline = PackedVector2Array()
		start_nav_btn.disabled = true
		route_summary_label.text = "Route error: " + str(current_route.get("reason", "Unknown"))
		canvas.queue_redraw()
		return

	var poly: PackedVector2Array = current_route["polyline"]
	canvas.route_polyline = poly
	start_nav_btn.disabled = false
	var dist_str := MapProjection.distance_text(float(current_route["total_distance"]))
	var mins := maxi(1, roundi(float(current_route["estimated_seconds"]) / 60.0))
	var bridges := int(current_route.get("bridge_count", 0))
	var br_txt := " · %d flyovers" % bridges if bridges > 0 else ""
	route_summary_label.text = "OSM A* [%s] (%d ms) · %s · EST. %d min%s" % [route_mode.capitalize(), elapsed_ms, dist_str, mins, br_txt]

	var steps: Array = current_route["steps"]
	for i in mini(steps.size(), 40):
		var st: Dictionary = steps[i]
		var line := "%d. %s %s (%s)" % [i + 1, str(st["maneuver"]), str(st["road"]), MapProjection.distance_text(float(st["distance"]))]
		if str(st["maneuver"]) == "ARRIVE":
			line = "%d. ARRIVE at %s" % [i + 1, str(st["road"])]
		var lbl := _make_label(line, 11, UiTheme.TEXT if i == 0 else UiTheme.TEXT_DIM)
		lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		route_steps_box.add_child(lbl)

	_frame_route(poly)
	minimap.update_state(canvas.player_pos, canvas.player_heading, poly, _last_street_name)
	canvas.queue_redraw()


func _frame_route(poly: PackedVector2Array) -> void:
	if poly.is_empty():
		return
	var lo := poly[0]
	var hi := poly[0]
	for p: Vector2 in poly:
		lo = lo.min(p)
		hi = hi.max(p)
	var span := maxf(hi.y - lo.y, (hi.x - lo.x) * 0.55)
	canvas.focus_on((lo + hi) * 0.5, maxf(950.0, span * 1.45))


func _start_navigation() -> void:
	if current_route.is_empty() or not bool(current_route.get("ok", false)):
		return
	navigating = true
	_sim_progress_m = 0.0
	_sim_offroute_offset = Vector2.ZERO
	route_panel.visible = false
	inspector_panel.visible = false
	nav_panel.visible = true
	var poly: PackedVector2Array = current_route["polyline"]
	if poly.size() >= 2:
		canvas.player_pos = poly[0]
		var dir := (poly[1] - poly[0]).normalized()
		canvas.player_heading = atan2(-dir.x, -dir.y)
		canvas.focus_on(canvas.player_pos, 950.0)
	_update_street_and_locality(true)
	_update_nav_hud(float(current_route["total_distance"]))
	minimap.update_state(canvas.player_pos, canvas.player_heading, poly, _last_street_name)


func _stop_navigation() -> void:
	navigating = false
	sim_driving = false
	sim_drive_btn.text = "SIM DRIVE"
	nav_panel.visible = false


func _toggle_sim_drive() -> void:
	if not navigating:
		if current_route.is_empty() or not bool(current_route.get("ok", false)):
			_load_sample_multi_stop_route()
		_start_navigation()
	sim_driving = not sim_driving
	sim_drive_btn.text = "PAUSE SIM" if sim_driving else "SIM DRIVE"


func _trigger_offroute_test() -> void:
	if not navigating:
		return
	_sim_offroute_offset = Vector2(95.0, -75.0)
	canvas.player_pos += _sim_offroute_offset
	_show_banner("OFF ROUTE", "DEVIATION DETECTED", "Recalculating offline OSM A* route...", 2.8)
	_recalculate_from_player()


func _recalculate_from_player() -> void:
	start_stop = {"role": "start", "name": "Current Position", "pos": canvas.player_pos, "is_player": true}
	_rebuild_stops_ui()
	_compute_and_show_route()
	_sim_progress_m = 0.0
	_sim_offroute_offset = Vector2.ZERO
	if bool(current_route.get("ok", false)):
		_update_nav_hud(float(current_route["total_distance"]))


func _update_nav_hud(remaining_m: float) -> void:
	var steps: Array = current_route.get("steps", [])
	var total_d := float(current_route.get("total_distance", 0.0))
	var travelled := maxf(0.0, total_d - remaining_m)
	var next_step: Dictionary = steps[steps.size() - 1] if not steps.is_empty() else {}
	var current_step_road := _last_street_name
	for st_var: Variant in steps:
		var st := st_var as Dictionary
		var cum := float(st.get("cum_distance", 0.0))
		if cum > travelled + 15.0:
			next_step = st
			break
		current_step_road = str(st.get("road", current_step_road))

	var dist_to_turn := maxf(10.0, float(next_step.get("cum_distance", total_d)) - travelled)
	nav_dist_label.text = "IN " + MapProjection.distance_text(dist_to_turn).to_upper()
	nav_turn_label.text = str(next_step.get("maneuver", "CONTINUE"))
	nav_road_label.text = str(next_step.get("road", "Destination"))
	nav_next_label.text = "On: %s · %s" % [_last_street_name if _last_street_name != "" else current_step_road, _last_locality_name]
	var rem_min := maxi(1, roundi(remaining_m / 9.5 / 60.0))
	nav_eta_label.text = "Remaining: %s · EST. %d min" % [MapProjection.distance_text(remaining_m), rem_min]


func _load_sample_multi_stop_route() -> void:
	# Real Chennai multi-waypoint demo: Anna Nagar 2nd Ave -> Egmore Station -> Marina Beach
	start_stop = {"role": "start", "name": "Anna Nagar 2nd Avenue", "pos": Vector2(40.0, 60.0), "is_player": true}
	waypoints = [{"role": "waypoint", "name": "Egmore Station", "pos": Vector2(5279.0, 782.0)}]
	dest_stop = {"role": "dest", "name": "Marina Beach", "pos": Vector2(7991.7, 3422.5)}
	route_panel.visible = true
	_rebuild_stops_ui()
	_compute_and_show_route()


func _clear_route() -> void:
	_stop_navigation()
	waypoints.clear()
	dest_stop = {}
	current_route = {}
	canvas.route_polyline = PackedVector2Array()
	_rebuild_stops_ui()
	_compute_and_show_route()


func _reset_prototype() -> void:
	_clear_route()
	selected_place = {}
	canvas.selected_pin = {}
	canvas.measure_points.clear()
	pick_mode = ""
	measure_toggle_btn.text = "RULER"
	inspector_panel.visible = false
	search_panel.visible = false
	saved_panel.visible = false
	layers_panel.visible = false
	route_panel.visible = false
	minimap.visible = true
	canvas.player_pos = PLAYER_START
	canvas.player_heading = 0.0
	canvas.focus_on(PLAYER_START, 1800.0)
	_update_street_and_locality(true)
	minimap.update_state(canvas.player_pos, canvas.player_heading, PackedVector2Array(), _last_street_name)


func _toggle_route_drawer() -> void:
	route_panel.visible = not route_panel.visible
	_rebuild_stops_ui()


func _toggle_layers_drawer() -> void:
	layers_panel.visible = not layers_panel.visible
	if layers_panel.visible:
		saved_panel.visible = false
	minimap.visible = not layers_panel.visible
	_update_layer_note()


func _toggle_saved_drawer() -> void:
	saved_panel.visible = not saved_panel.visible
	if saved_panel.visible:
		layers_panel.visible = false
		minimap.visible = true
		_rebuild_saved_ui()


func _toggle_measure_mode() -> void:
	if pick_mode == "measure":
		pick_mode = ""
		canvas.measure_points.clear()
		measure_toggle_btn.text = "RULER"
		canvas.queue_redraw()
		_set_status("Ruler cleared.")
	else:
		pick_mode = "measure"
		canvas.measure_points.clear()
		measure_toggle_btn.text = "RULER*"
		canvas.queue_redraw()
		_set_status("RULER · Tap two points on the map to measure distance & bearing")


func _swap_start_dest() -> void:
	if dest_stop.is_empty():
		return
	var old_start := start_stop.duplicate()
	var old_dest := dest_stop.duplicate()
	start_stop = {"role": "start", "name": str(old_dest.get("name", "Start")), "pos": old_dest["pos"], "is_player": false}
	dest_stop = {"role": "dest", "name": str(old_start.get("name", "Destination")), "pos": old_start["pos"]}
	waypoints.reverse()
	_rebuild_stops_ui()
	_compute_and_show_route()


func _toggle_route_mode() -> void:
	route_mode = "shortest" if route_mode == "fastest" else "fastest"
	route_mode_btn.text = "Shortest" if route_mode == "shortest" else "Fastest"
	if not dest_stop.is_empty():
		_compute_and_show_route()


func _copy_selected_coords() -> void:
	if selected_place.is_empty():
		return
	var ll := data.to_latlng(selected_place["pos"] as Vector2)
	var coords := "%.5f, %.5f" % [ll.x, ll.y]
	DisplayServer.clipboard_set(coords)
	_set_status("Copied GPS: " + coords)


func _is_bookmarked(place_name: String) -> bool:
	for bm: Dictionary in bookmarks:
		if str(bm.get("name", "")) == place_name:
			return true
	return false


func _toggle_bookmark_selected() -> void:
	if selected_place.is_empty():
		return
	var nm := str(selected_place.get("name", "Location"))
	for i in bookmarks.size():
		if str(bookmarks[i].get("name", "")) == nm:
			bookmarks.remove_at(i)
			inspector_save_btn.text = "★ Save"
			_save_bookmarks()
			_rebuild_saved_ui()
			canvas.bookmarks = bookmarks
			canvas.queue_redraw()
			return
	var wp: Vector2 = selected_place["pos"]
	bookmarks.append({
		"name": nm,
		"name_ta": str(selected_place.get("name_ta", "")),
		"category": str(selected_place.get("category", "Place")),
		"locality": str(selected_place.get("locality", "Chennai")),
		"x": wp.x,
		"z": wp.y,
		"pos": wp,
		"preset": false,
	})
	inspector_save_btn.text = "★ Saved"
	_save_bookmarks()
	_rebuild_saved_ui()
	canvas.bookmarks = bookmarks
	canvas.queue_redraw()


func _load_bookmarks() -> void:
	bookmarks.clear()
	if FileAccess.file_exists(BOOKMARKS_PATH):
		var j := JSON.new()
		if j.parse(FileAccess.get_file_as_string(BOOKMARKS_PATH)) == OK and j.data is Array:
			for b_var: Variant in (j.data as Array):
				if b_var is Dictionary:
					var d := (b_var as Dictionary).duplicate()
					d["pos"] = Vector2(float(d.get("x", 0.0)), float(d.get("z", 0.0)))
					bookmarks.append(d)
	if bookmarks.is_empty():
		# Default Chennai quick-jump presets (clearly tagged)
		var presets: Array[Array] = [
			["Anna Nagar Tower [PRESET]", "அண்ணா நகர்", Vector2(402.4, -147.9), "Landmark"],
			["Marina Beach [PRESET]", "மெரினா கடற்கரை", Vector2(7991.7, 3422.5), "Beach"],
			["Chennai Central [PRESET]", "சென்னை சென்ட்ரல்", Vector2(7166.0, 290.0), "Railway Station"],
			["T. Nagar Pondy Bazaar [PRESET]", "தி. நகர்", Vector2(2640.0, 4660.0), "Locality"],
		]
		for p: Array in presets:
			var wp: Vector2 = p[2]
			bookmarks.append({
				"name": str(p[0]),
				"name_ta": str(p[1]),
				"category": str(p[3]),
				"locality": data.identify_locality_name(wp),
				"x": wp.x,
				"z": wp.y,
				"pos": wp,
				"preset": true,
			})
	canvas.bookmarks = bookmarks
	_rebuild_saved_ui()


func _save_bookmarks() -> void:
	var out: Array[Dictionary] = []
	for bm: Dictionary in bookmarks:
		out.append({
			"name": str(bm.get("name", "")),
			"name_ta": str(bm.get("name_ta", "")),
			"category": str(bm.get("category", "Place")),
			"locality": str(bm.get("locality", "Chennai")),
			"x": float((bm["pos"] as Vector2).x),
			"z": float((bm["pos"] as Vector2).y),
			"preset": bool(bm.get("preset", false)),
		})
	var f := FileAccess.open(BOOKMARKS_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(out, "\t"))


func _rebuild_saved_ui() -> void:
	if saved_list == null:
		return
	for ch in saved_list.get_children():
		ch.queue_free()
	for i in bookmarks.size():
		var bm := bookmarks[i]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		saved_list.add_child(row)
		var btn := Button.new()
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.custom_minimum_size = Vector2(0, 34)
		btn.add_theme_font_override("font", _font)
		btn.add_theme_font_size_override("font_size", 11)
		btn.text = "★ %s" % str(bm.get("name", "Place"))
		btn.pressed.connect(func() -> void:
			_select_place(bm)
			canvas.focus_on(bm["pos"] as Vector2, 1300.0)
			saved_panel.visible = false
		)
		row.add_child(btn)
		var idx := i
		row.add_child(_bar_btn("×", "DelBm%d" % i, 26, func() -> void:
			bookmarks.remove_at(idx)
			_save_bookmarks()
			_rebuild_saved_ui()
			canvas.bookmarks = bookmarks
			canvas.queue_redraw()
		))


func _update_layer_note() -> void:
	if not canvas.layers.get(&"metro", true):
		layer_note_label.text = "Metro overlay hidden."
	else:
		layer_note_label.text = "Metro tracks are not in current OSM rail extract; Suburban/MRTS & 23 stations are real."


func _on_view_changed() -> void:
	pass


func _set_status(msg: String) -> void:
	if status_label != null:
		status_label.text = msg


func _apply_cli_demo() -> void:
	var demo := ""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--demo="):
			demo = arg.trim_prefix("--demo=")
	match demo:
		"city":
			canvas.focus_on(Vector2(2800.0, 1800.0), 18500.0)
		"street":
			canvas.focus_on(Vector2(180.0, -40.0), 640.0)
			_show_banner("ENTERING STREET", "ANNA NAGAR 2ND AVENUE", "Anna Nagar (அண்ணா நகர்), Chennai", 10.0)
		"search":
			search_edit.text = "Marina"
			_refresh_search_results("Marina")
			var hits := data.search("Marina", canvas.player_pos, 4)
			if not hits.is_empty():
				_select_place(hits[0])
				canvas.focus_on(hits[0]["pos"] as Vector2, 1600.0)
		"route":
			_load_sample_multi_stop_route()
		"nav":
			_load_sample_multi_stop_route()
			_start_navigation()
			_sim_progress_m = 2100.0
			var poly: PackedVector2Array = current_route.get("polyline", PackedVector2Array())
			if poly.size() >= 2:
				var sample := _sample_polyline(poly, _sim_progress_m)
				canvas.player_pos = sample["pos"]
				var dir: Vector2 = sample["dir"]
				canvas.player_heading = atan2(-dir.x, -dir.y)
				canvas.focus_on(canvas.player_pos, 1100.0)
				_update_street_and_locality(true)
				_update_nav_hud(sample["remaining"])
				minimap.update_state(canvas.player_pos, canvas.player_heading, poly, _last_street_name)
				_show_banner("ENTERING STREET", _last_street_name.to_upper(), "%s, Chennai" % _last_locality_name, 10.0)
		"layers":
			layers_panel.visible = true
			minimap.visible = false
			canvas.focus_on(Vector2(6500.0, 2200.0), 5200.0)
		"measure":
			pick_mode = "measure"
			measure_toggle_btn.text = "RULER*"
			canvas.measure_points = [Vector2(40.0, 60.0), Vector2(1240.0, 760.0)]
			canvas.focus_on(Vector2(640.0, 410.0), 2200.0)
			saved_panel.visible = true
			_rebuild_saved_ui()


static func _sample_polyline(poly: PackedVector2Array, dist_m: float) -> Dictionary:
	var total := 0.0
	for i in range(poly.size() - 1):
		total += poly[i].distance_to(poly[i + 1])
	var target := clampf(dist_m, 0.0, total)
	var acc := 0.0
	for i in range(poly.size() - 1):
		var a := poly[i]
		var b := poly[i + 1]
		var seg := a.distance_to(b)
		if acc + seg >= target and seg > 0.01:
			var t := (target - acc) / seg
			return {"pos": a.lerp(b, t), "dir": (b - a) / seg, "remaining": maxf(0.0, total - target)}
		acc += seg
	var last := poly[poly.size() - 1]
	var prev := poly[poly.size() - 2]
	return {"pos": last, "dir": (last - prev).normalized(), "remaining": 0.0}


static func _distance_to_polyline(p: Vector2, poly: PackedVector2Array) -> float:
	var best := INF
	for i in range(poly.size() - 1):
		var c := Geometry2D.get_closest_point_to_segment(p, poly[i], poly[i + 1])
		best = minf(best, p.distance_to(c))
	return best


func _make_label(text: String, size_px: int, col: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", _font)
	l.add_theme_font_size_override("font_size", size_px)
	l.add_theme_color_override("font_color", col)
	return l


func _bar_btn(text: String, node_name: String, min_w: float, on_press: Callable) -> Button:
	var b := Button.new()
	b.name = node_name
	b.text = text
	b.custom_minimum_size = Vector2(min_w, 34)
	b.add_theme_font_override("font", _font)
	b.add_theme_font_size_override("font_size", 12)
	b.pressed.connect(on_press)
	return b


static func _glass_panel(alpha: float, radius: int, border: Color = Color(1, 1, 1, 0.16)) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.05, 0.06, 0.09, alpha)
	box.border_color = border
	box.set_border_width_all(1)
	box.set_corner_radius_all(radius)
	box.content_margin_left = 10
	box.content_margin_right = 10
	box.content_margin_top = 6
	box.content_margin_bottom = 6
	return box
