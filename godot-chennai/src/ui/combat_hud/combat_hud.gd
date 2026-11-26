class_name CombatHud
extends RefCounted
## The fight's part of the HUD (G-413; ports of the Three.js health bar in `Hud.ts` and
## `WantedStars.ts`): a thin glass health bar and the five wanted stars, in one row under the
## money line of the mission column (so it never meets PAUSE, JOBS or the minimap, which sit
## top-right), and a red edge flash when the player is hurt. The stars are hidden while not
## wanted and flash red and blue while the police can see the player. No gameplay: the
## combat wiring sets the values; drawing only happens when a value changes (no per-frame work
## while nothing does).

const BAR_SIZE := Vector2(132, 10)
const STAR := 9.0
const STAR_GAP := 4.0
## Seconds the hurt flash fades over, and its strongest alpha (a mild edge, not a full screen).
const FLASH_TIME := 0.45
const FLASH_ALPHA := 0.35

var row: HBoxContainer
var bar: HealthBar
var stars: WantedStars
var flash: HurtFlash


static func make() -> CombatHud:
	var h := CombatHud.new()
	h.row = HBoxContainer.new()
	h.row.name = "CombatRow"
	h.row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.row.add_theme_constant_override("separation", 10)
	h.bar = HealthBar.new()
	h.bar.name = "Health"
	h.row.add_child(h.bar)
	h.stars = WantedStars.new()
	h.stars.name = "Wanted"
	h.row.add_child(h.stars)
	h.flash = HurtFlash.new()
	h.flash.name = "HurtFlash"
	return h


## Into the mission HUD: the row under its stats, the flash under everything else.
func attach(hud: MissionHud) -> void:
	hud.add_column_row(row)
	hud.add_child(flash)
	hud.move_child(flash, 0)


## 0..1 of full health.
func set_health(share: float) -> void:
	bar.set_value(share)


func set_wanted(level: int, seen: bool) -> void:
	stars.set_level(level, seen)


func flash_hurt() -> void:
	flash.hit()


## The health bar: a glass pill, the fill green above half, amber, then red below a quarter.
class HealthBar:
	extends Control
	var value := 1.0

	func _init() -> void:
		custom_minimum_size = CombatHud.BAR_SIZE
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_value(v: float) -> void:
		var next := clampf(v, 0.0, 1.0)
		if absf(next - value) < 0.002:
			return
		value = next
		queue_redraw()

	func colour() -> Color:
		if value > 0.5:
			return Color("#5fd17a")
		return UiTheme.AMBER if value > 0.25 else UiTheme.DANGER

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		var radius := size.y * 0.5
		draw_style_box(UiTheme.glass_box(Color(0, 0, 0, 0.45), UiTheme.GLASS_OUTLINE, int(radius)), r)
		if value > 0.0:
			var fill := StyleBoxFlat.new()
			fill.bg_color = colour()
			fill.set_corner_radius_all(int(radius))
			draw_style_box(fill, Rect2(Vector2(1, 1), Vector2(maxf(size.y, (size.x - 2.0) * value), size.y - 2.0)))


## Five stars, lit for each star of the level; the lit ones flash red and blue while seen.
class WantedStars:
	extends Control
	var level := 0
	var seen := false
	var _flash_on := false
	var _clock := 0.0

	func _init() -> void:
		custom_minimum_size = Vector2(5.0 * CombatHud.STAR * 2.0 + 4.0 * CombatHud.STAR_GAP, CombatHud.STAR * 2.0)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		visible = false
		set_process(false)

	func set_level(next: int, now_seen: bool) -> void:
		var flashing := now_seen and next > 0
		if next == level and flashing == seen:
			return
		level = next
		seen = flashing
		visible = next > 0
		set_process(flashing)
		queue_redraw()

	func _process(dt: float) -> void:
		_clock += dt
		if _clock >= 0.25:
			_clock = 0.0
			_flash_on = not _flash_on
			queue_redraw()

	func lit_colour() -> Color:
		if not seen:
			return Color("#ffd166")
		return Color("#ff5050") if _flash_on else Color("#5b8cff")

	func _draw() -> void:
		var r := CombatHud.STAR
		for i in 5:
			var c := Vector2(r + i * (r * 2.0 + CombatHud.STAR_GAP), r)
			var pts := PackedVector2Array()
			for k in 10:
				var a := -PI / 2.0 + k * PI / 5.0
				var rr := r if k % 2 == 0 else r * 0.45
				pts.append(c + Vector2(cos(a), sin(a)) * rr)
			var on := i < level
			draw_colored_polygon(pts, lit_colour() if on else Color(1, 1, 1, 0.22))
			pts.append(pts[0])
			draw_polyline(pts, Color(0, 0, 0, 0.55), 1.0, true)


## A red edge round the screen that fades after a hit (four gradient strips: no full-screen fill).
class HurtFlash:
	extends Control
	var left := 0.0

	func _init() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_process(false)

	func hit() -> void:
		left = CombatHud.FLASH_TIME
		set_process(true)
		queue_redraw()

	func strength() -> float:
		return CombatHud.FLASH_ALPHA * clampf(left / CombatHud.FLASH_TIME, 0.0, 1.0)

	func _process(dt: float) -> void:
		left = maxf(0.0, left - dt)
		if left <= 0.0:
			set_process(false)
		queue_redraw()

	func _draw() -> void:
		var a := strength()
		if a <= 0.0:
			return
		var edge := minf(size.x, size.y) * 0.12
		var red := Color(UiTheme.DANGER, a)
		var clear := Color(UiTheme.DANGER, 0.0)
		var w := size.x
		var h := size.y
		_strip(Vector2(0, 0), Vector2(w, 0), Vector2(w, edge), Vector2(0, edge), red, clear)
		_strip(Vector2(0, h), Vector2(w, h), Vector2(w, h - edge), Vector2(0, h - edge), red, clear)
		_strip(Vector2(0, 0), Vector2(0, h), Vector2(edge, h), Vector2(edge, 0), red, clear)
		_strip(Vector2(w, 0), Vector2(w, h), Vector2(w - edge, h), Vector2(w - edge, 0), red, clear)

	func _strip(a: Vector2, b: Vector2, c: Vector2, d: Vector2, outer: Color, inner: Color) -> void:
		draw_polygon(PackedVector2Array([a, b, c, d]), PackedColorArray([outer, outer, inner, inner]))
