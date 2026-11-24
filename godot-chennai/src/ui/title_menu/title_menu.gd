class_name TitleMenu
extends CanvasLayer
## The title menu over the city (TD-25): PLAY (carries on from the save), NEW GAME, ABOUT (credits, OpenStreetMap attribution with
## the extract date, what is estimated) and QUIT (only where an app can quit). Only real options.
## Keyboard and D-pad focus work on both pages; Back goes from ABOUT to the menu, then asks the
## composition root to quit.

signal play_requested
## NEW GAME: forget the saved progress, then play (emitted before `play_requested`).
signal new_game_requested
signal quit_requested

var _menu: VBoxContainer
var _about: VBoxContainer
var _about_text: Label
var _play: Button
var _about_back: Button

@onready var _root: Control = $Root


func _ready() -> void:
	layer = 5
	_root.theme = UiTheme.get_theme()
	var margin := SafeAreaMargin.new()
	margin.gutter = 20
	_root.add_child(margin)
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	panel.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	margin.add_child(panel)
	var pages := VBoxContainer.new()
	panel.add_child(pages)
	_menu = VBoxContainer.new()
	_menu.name = "Menu"
	_menu.add_theme_constant_override("separation", 10)
	pages.add_child(_menu)
	_menu.add_child(UiTheme.label("CHENNAI", UiTheme.TITLE_SIZE, UiTheme.AMBER))
	_menu.add_child(UiTheme.label("Open world · Godot test build", UiTheme.BODY_SIZE, UiTheme.TEXT_DIM))
	_play = UiTheme.button("PLAY")
	_play.name = "Play"
	_play.pressed.connect(func() -> void: play_requested.emit())
	_menu.add_child(_play)
	var fresh := UiTheme.button("NEW GAME")
	fresh.name = "NewGame"
	fresh.pressed.connect(func() -> void:
		new_game_requested.emit()
		play_requested.emit())
	_menu.add_child(fresh)
	var about := UiTheme.button("ABOUT")
	about.name = "About"
	about.pressed.connect(show_about)
	_menu.add_child(about)
	if can_quit():
		var quit := UiTheme.button("QUIT")
		quit.name = "Quit"
		quit.pressed.connect(func() -> void: quit_requested.emit())
		_menu.add_child(quit)
	_about = VBoxContainer.new()
	_about.name = "AboutPage"
	_about.visible = false
	_about.add_theme_constant_override("separation", 10)
	pages.add_child(_about)
	_about.add_child(UiTheme.label("ABOUT", UiTheme.BUTTON_SIZE + 4, UiTheme.AMBER))
	_about_text = UiTheme.label("")
	_about_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_about_text.custom_minimum_size = Vector2(380, 0)
	_about.add_child(_about_text)
	_about_back = UiTheme.button("BACK")
	_about_back.name = "Back"
	_about_back.pressed.connect(show_menu)
	_about.add_child(_about_back)
	set_credits("", "")
	show_menu()


## Desktop and Android apps can quit; a web page cannot.
static func can_quit() -> bool:
	return not OS.has_feature("web")


## The map credit shown on ABOUT: the index's attribution and its OSM data date.
func set_credits(attribution: String, data_date: String) -> void:
	var credit := attribution if attribution != "" else "© OpenStreetMap contributors"
	var date := " (map data %s)" % data_date.substr(0, 10) if data_date != "" else ""
	_about_text.text = "An original game set in real Chennai.\nMap: %s%s, ODbL 1.0. Building heights, colours and road widths are estimated where OpenStreetMap has none." % [credit, date]


func show_menu() -> void:
	_about.visible = false
	_menu.visible = true
	_play.grab_focus()


func show_about() -> void:
	_menu.visible = false
	_about.visible = true
	_about_back.grab_focus()


func is_about_open() -> bool:
	return _about.visible


## Android Back / Escape: one level up. Returns false when already at the top (the caller quits).
func go_back() -> bool:
	if _about.visible:
		show_menu()
		return true
	return false
