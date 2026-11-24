class_name MedalBadge
extends Control
## The medal on the medals screen (G-144): a round badge in bronze, silver or gold with a ribbon.
## "" draws a plain grey disc (a stage without goals earns none).

const COLOURS := {"bronze": Color("#b8733a"), "silver": Color("#c8ccd2"), "gold": Color("#f2b82a"), "": Color("#4b5058")}
var medal := ""


func _init() -> void:
	custom_minimum_size = Vector2(84, 96)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_medal(m: String) -> void:
	medal = m
	queue_redraw()


func _draw() -> void:
	var c := Vector2(size.x / 2.0, 36.0)
	var col: Color = COLOURS.get(medal, COLOURS[""])
	draw_colored_polygon(PackedVector2Array([c + Vector2(-16, 14), c + Vector2(-4, 14), c + Vector2(-8, 52), c + Vector2(-18, 44)]), col.darkened(0.35))
	draw_colored_polygon(PackedVector2Array([c + Vector2(16, 14), c + Vector2(4, 14), c + Vector2(8, 52), c + Vector2(18, 44)]), col.darkened(0.35))
	draw_circle(c, 31.0, col.darkened(0.25))
	draw_circle(c, 27.0, col)
	draw_arc(c, 20.0, 0.0, TAU, 32, col.lightened(0.45), 2.0)
	var label := medal.to_upper().left(1) if medal != "" else "-"
	draw_string(ThemeDB.fallback_font, c + Vector2(-8, 8), label, HORIZONTAL_ALIGNMENT_CENTER, 16, 24, col.darkened(0.6))
