class_name UiIcons
extends RefCounted
## The few HUD icons, drawn from lines so they stay crisp at any scale and cost no texture
## (free of any asset licence). White, thin, rounded: the same weight as the glass buttons'
## outline (`UiTheme.glass_box`). `draw` paints icon `kind` centred on `c` inside radius `r`.

const PAUSE := &"pause"
const EXIT := &"exit"
const JUMP := &"jump"


static func draw(ci: CanvasItem, kind: StringName, c: Vector2, r: float, colour: Color = UiTheme.ICON) -> void:
	var w := maxf(2.0, r * 0.16)
	match kind:
		PAUSE:
			for side: float in [-1.0, 1.0]:
				var x := c.x + side * r * 0.26
				ci.draw_line(Vector2(x, c.y - r * 0.38), Vector2(x, c.y + r * 0.38), colour, w * 1.5, true)
		EXIT:
			var a := r * 0.34
			ci.draw_line(c + Vector2(-a, -a), c + Vector2(a, a), colour, w, true)
			ci.draw_line(c + Vector2(-a, a), c + Vector2(a, -a), colour, w, true)
		JUMP:
			var a := r * 0.4
			ci.draw_polyline(PackedVector2Array([c + Vector2(-a, a * 0.45), c + Vector2(0.0, -a * 0.55), c + Vector2(a, a * 0.45)]), colour, w, true)
			ci.draw_line(c + Vector2(0.0, -a * 0.55), c + Vector2(0.0, a * 0.95), colour, w, true)
