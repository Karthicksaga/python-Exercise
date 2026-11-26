extends Node
## Builds the screen of `i18n_shots.gd` and saves it (a node, so its scripts compile after the autoloads).

const TITLE := preload("res://src/ui/title_menu/title_menu.tscn")
const LOADING := preload("res://src/ui/loading_screen/loading_screen.tscn")


func run() -> void:
	var o := {"screen": "pause", "mode": "ta", "out": "user://i18n.png"}
	for arg in OS.get_cmdline_user_args():
		var kv := arg.trim_prefix("--").split("=", true, 1)
		if kv.size() == 2:
			o[kv[0]] = kv[1]
	await get_tree().process_frame
	var mode := Tr.Mode.TAMIL
	match str(o["mode"]):
		"en":
			mode = Tr.Mode.ENGLISH
		"both":
			mode = Tr.Mode.BOTH
	Tr.set_mode(mode)
	# A sky-and-street coloured backdrop for the 3D view.
	var layer := CanvasLayer.new()
	layer.layer = -1
	get_tree().root.add_child(layer)
	var sky := ColorRect.new()
	sky.color = Color("#7d95a6")
	sky.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(sky)
	var street := ColorRect.new()
	street.color = Color("#555b5e")
	street.anchor_top = 0.62
	street.anchor_right = 1.0
	street.anchor_bottom = 1.0
	layer.add_child(street)
	var content := GameContent.load_file()
	match str(o["screen"]):
		"pause":
			var menu := PauseMenu.new()
			get_tree().root.add_child(menu)
			var controls := ControlSettings.new()
			controls.path = "user://i18n-shots-controls.json"
			var language := LanguageSettings.new()
			language.path = "user://i18n-shots-language.json"
			menu.add_setting(&"Time", func() -> String: return Tr.t("set.time", [Tr.ref("time.evening"), "17:45"]), func() -> void: pass)
			menu.add_setting(&"Weather", func() -> String: return Tr.t("set.weather", [&"weather.clear"]), func() -> void: pass)
			menu.add_setting(&"Sound", func() -> String: return Tr.t("set.sound", [&"set.on"]), func() -> void: pass)
			menu.add_setting(&"Language", func() -> String: return Tr.t("set.language", [LanguageSettings.name_of(Tr.mode)]), func() -> void: pass)
			ControlSettingsRows.add_to(menu, controls)
			await get_tree().process_frame
			menu.open()
		"title", "about", "settings", "controls":
			var title: TitleMenu = TITLE.instantiate()
			get_tree().root.add_child(title)
			title.reduced_motion = true
			title.set_credits("© OpenStreetMap contributors", "2026-11-15T00:16:27Z")
			title.add_setting(&"Time", func() -> String: return Tr.t("set.time", [Tr.ref("time.evening"), "17:45"]), func() -> void: pass)
			title.add_setting(&"Weather", func() -> String: return Tr.t("set.weather", [&"weather.clear"]), func() -> void: pass)
			title.add_setting(&"Sound", func() -> String: return Tr.t("set.sound", [&"set.on"]), func() -> void: pass)
			title.add_setting(&"Language", func() -> String: return Tr.t("set.language", [LanguageSettings.name_of(Tr.mode)]), func() -> void: pass)
			title.set_place("Marina Beach", "%s · 17:45 · %s" % [Tr.line("time.evening"), Tr.line("weather.rain")])
			title.set_save({"has_save": true, "continue_line": Tr.line("title.continue_line", [Tr.ref("title.stage", [3]), "2,400", 2, 21])})
			await get_tree().process_frame
			if str(o["screen"]) != "title":
				title.call("show_" + str(o["screen"]))
		"hud", "dialog", "drive":
			var hud := MissionHud.new()
			get_tree().root.add_child(hud)
			var pause := PauseMenu.new()
			get_tree().root.add_child(pause)
			pause.show_pause_button(true)
			if str(o["screen"]) == "drive":
				var d := DrivingControls.new()
				get_tree().root.add_child(d)
				d.set_mode(&"driving", "ctl.siren")
			else:
				var t := TouchControls.new()
				get_tree().root.add_child(t)
			await get_tree().process_frame
			hud.set_stats("2,400", 3, 21, 50)
			hud.set_mission({"title": Tr.line("msn.panel_stage", [3, Tr.srcref("Auto shift")]), "objective": Tr.src("Pick up the passenger"), "distance": 450.0, "seconds_left": 95.0}, 0.0)
			hud.toast(Tr.t("msn.stage_notice", [3, Tr.srcref("Auto shift")]), Tr.src(content.missions[2].brief), 30.0)
			if str(o["screen"]) == "dialog":
				var rows: Array[Dictionary] = []
				for k in 4:
					var j: JobData.Job = content.jobs[k]
					rows.append({"id": j.id, "title": Tr.src(j.title), "detail": Tr.src(j.brief), "meta": Tr.line("msn.job_meta", [Tr.ref("veh.label.ambulance"), j.payout, 5]), "button": Tr.t("dlg.take_job")})
				var actions: Array[Dictionary] = [{"id": "tab", "label": Tr.t("dlg.stages"), "quiet": true}, {"id": "close", "label": Tr.t("dlg.close"), "quiet": true}]
				hud.show_dialog(Tr.t("dlg.job_board"), Tr.t("msn.board_default", [50]), rows, actions)
		"loading":
			var l: LoadingScreen = LOADING.instantiate()
			get_tree().root.add_child(l)
			l.set_steps(Main.STEPS)
			l.finish_step(0)
			l.begin_step(2)
	for i in 12:
		await get_tree().process_frame
	var image := get_tree().root.get_texture().get_image()
	var err := image.save_png(str(o["out"]))
	print("i18n shot %s (%dx%d) screen=%s mode=%s: %s" % [o["out"], image.get_width(), image.get_height(), o["screen"], o["mode"], error_string(err)])
	get_tree().quit(0 if err == OK else 1)
