class_name HomeKolam
extends RefCounted
## The kolam drawn at the doorstep (from the prototype): white rice-flour dots in a diamond, four
## loops through them and a ring round all, as a transparent image. Pure pixels, no assets.

const PIXELS := 256


static func make(px: int = PIXELS) -> Image:
	var img := Image.create(px, px, false, Image.FORMAT_RGBA8)
	var s := float(px) / 256.0
	var white := Color(1, 1, 1, 0.95)
	var c := Vector2(128, 128) * s
	for i in range(-2, 3):
		for j in range(-2, 3):
			if absi(i) + absi(j) <= 2:
				_disc(img, c + Vector2(i, j) * 40.0 * s, 4.0 * s, white)
	_ring(img, c, 100.0 * s, 1.6 * s, white)
	for a in 4:
		var p0 := c + Vector2(cos(float(a) * PI * 0.5), sin(float(a) * PI * 0.5)) * 80.0 * s
		var p2 := c + Vector2(cos(float(a + 1) * PI * 0.5), sin(float(a + 1) * PI * 0.5)) * 80.0 * s
		var steps := 90
		for k in steps + 1:
			var t := float(k) / float(steps)
			var q := p0.lerp(c, t).lerp(c.lerp(p2, t), t)
			_disc(img, q, 1.6 * s, white)
	return img


static func _disc(img: Image, at: Vector2, r: float, colour: Color) -> void:
	var x0 := maxi(0, floori(at.x - r))
	var x1 := mini(img.get_width() - 1, ceili(at.x + r))
	var y0 := maxi(0, floori(at.y - r))
	var y1 := mini(img.get_height() - 1, ceili(at.y + r))
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			if Vector2(float(x) + 0.5, float(y) + 0.5).distance_to(at) <= r:
				img.set_pixel(x, y, colour)


static func _ring(img: Image, centre: Vector2, radius: float, width: float, colour: Color) -> void:
	var steps := int(radius * TAU)
	for k in steps:
		var a := TAU * float(k) / float(steps)
		_disc(img, centre + Vector2(cos(a), sin(a)) * radius, width, colour)
