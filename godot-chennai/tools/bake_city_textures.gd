extends SceneTree
## Bakes the city's textures into `assets/city/textures/` (decision G-52), a port of the canvas
## painters of the Three.js game (`textures.ts`, `kitAtlas.ts`, the kerb paint of
## `StreetFurniture.ts`). Needs a renderer (text shaping and canvas drawing), so run under xvfb:
##
##     xvfb-run -a godot --path . --rendering-method gl_compatibility --rendering-driver opengl3 \
##       --audio-driver Dummy --script res://tools/bake_city_textures.gd
##
## Then re-import (`godot --headless --import`). The PNGs are committed, so the game and the
## tests never paint at run time. Deterministic: the noise is the same LCG as the TS painters.

const OUT := "res://assets/city/textures"
const TAMIL_FONT := "res://assets/city/noto-sans-tamil-categories.woff2"

var _state: int = 0
var _tamil: Font
var _latin: Font


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	await process_frame
	_tamil = load(TAMIL_FONT) as Font
	var bold := FontVariation.new()
	bold.base_font = ThemeDB.fallback_font
	bold.variation_embolden = 0.9
	_latin = bold
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	var only := _only()
	if only == "ground":
		await _bake("ground.png", Vector2i(CityAtlas.GROUND_TILE_PX * CityAtlas.GROUND_TILES, 256), _ground, false)
		quit(0)
		return
	await _bake("facade.png", Vector2i(CityAtlas.FACADE_TILE_PX * CityAtlas.FACADE_TILES, 256), _facade, false)
	await _bake("facade_glow.png", Vector2i(CityAtlas.FACADE_TILE_PX * CityAtlas.FACADE_TILES, 256), _facade_glow, false)
	await _bake("roof_tiles.png", Vector2i(128, 128), _roof, false)
	await _bake("ground.png", Vector2i(CityAtlas.GROUND_TILE_PX * CityAtlas.GROUND_TILES, 256), _ground, false)
	var kit := await _bake("kit.png", Vector2i(CityAtlas.KIT_PX, CityAtlas.KIT_H), _kit, true)
	var glow := _kit_glow(kit)
	glow.save_png(OUT.path_join("kit_glow.png"))
	print("baked kit_glow.png")
	quit(0)


## `-- --only=ground` bakes just the ground atlas.
func _only() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--only="):
			return arg.trim_prefix("--only=")
	return ""


func _bake(file: String, size: Vector2i, painter: Callable, transparent: bool) -> Image:
	var vp := SubViewport.new()
	vp.size = size
	vp.transparent_bg = transparent
	vp.disable_3d = true
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	var canvas := Node2D.new()
	canvas.draw.connect(func() -> void: painter.call(canvas))
	vp.add_child(canvas)
	root.add_child(vp)
	for i in 3:
		await process_frame
	var img := vp.get_texture().get_image()
	if not transparent:
		img.convert(Image.FORMAT_RGB8)
	img.save_png(OUT.path_join(file))
	print("baked %s %dx%d" % [file, img.get_width(), img.get_height()])
	vp.queue_free()
	return img


# --- helpers ---------------------------------------------------------------------------------

func _seed(s: int) -> void:
	_state = s & 0xffffffff


func _rand() -> float:
	_state = (CityHash.imul(_state, 1664525) + 1013904223) & 0xffffffff
	return _state / 4294967296.0


func _rect(c: Node2D, x: float, y: float, w: float, h: float, col: Color) -> void:
	c.draw_rect(Rect2(x, y, w, h), col)


func _css(hex: String, alpha: float = 1.0) -> Color:
	var col := Color.html(hex)
	col.a = alpha
	return col


func _rgba(r: int, g: int, b: int, a: float) -> Color:
	return Color8(r, g, b, roundi(a * 255.0))


## Vertical gradient from c0 at the top to c1 at the bottom.
func _vgrad(c: Node2D, x: float, y: float, w: float, h: float, c0: Color, c1: Color) -> void:
	c.draw_polygon(PackedVector2Array([Vector2(x, y), Vector2(x + w, y), Vector2(x + w, y + h), Vector2(x, y + h)]), PackedColorArray([c0, c0, c1, c1]))


## A soft round blotch fading to nothing at radius r.
func _blotch(c: Node2D, x: float, y: float, r: float, col: Color) -> void:
	var rim := Color(col, 0.0)
	const N := 16
	for i in N:
		var a0 := TAU * i / N
		var a1 := TAU * (i + 1) / N
		c.draw_polygon(PackedVector2Array([Vector2(x, y), Vector2(x + cos(a0) * r, y + sin(a0) * r), Vector2(x + cos(a1) * r, y + sin(a1) * r)]), PackedColorArray([col, rim, rim]))


func _grain(c: Node2D, ox: float, size: float, count: int, strength: float, s: int) -> void:
	_seed(s)
	for i in count:
		var shade := 0.0 if _rand() < 0.5 else 1.0
		var col := Color(shade, shade, shade, _rand() * strength)
		var px := 1.0 + _rand() * 2.0
		_rect(c, ox + _rand() * size, _rand() * size, px, px, col)


func _plaster(c: Node2D, ox: float, size: float, s: int) -> void:
	_rect(c, ox, 0, size, size, _css("#f4f4f2"))
	_seed(s)
	for i in 26:
		var x := _rand() * size
		var y := _rand() * size
		var r := 14.0 + _rand() * 40.0
		_blotch(c, ox + x, y, r, _rgba(90, 80, 70, 0.03 + _rand() * 0.05))
	for i in 10:
		var x := _rand() * size
		var len := size * (0.3 + _rand() * 0.5)
		_vgrad(c, ox + x, 0, 2.0 + _rand() * 5.0, len, _rgba(60, 55, 50, 0.10), _rgba(60, 55, 50, 0.0))
	_grain(c, ox, size, 900, 0.05, s + 1)


func _window(c: Node2D, x: float, y: float, w: float, h: float) -> void:
	_rect(c, x - 10, y - 14, w + 20, 8, _css("#d8d5cf"))
	_rect(c, x - 6, y - 6, w + 12, 7, Color(0, 0, 0, 0.28))
	_rect(c, x, y, w, h, _css("#4b3a2c"))
	_vgrad(c, x + 5, y + 5, w - 10, h - 10, _css("#5f8194"), _css("#1f3442"))
	c.draw_polygon(PackedVector2Array([Vector2(x + 5, y + h - 5), Vector2(x + 5, y + 5), Vector2(x + w * 0.55, y + 5)]), PackedColorArray([Color(1, 1, 1, 0.16)]))
	_rect(c, x + w / 2 - 2, y, 4, h, _css("#4b3a2c"))
	var bar := y + 14
	while bar < y + h - 6:
		_rect(c, x + 5, bar, w - 10, 2, Color(0.08, 0.08, 0.08, 0.55))
		bar += 12
	_rect(c, x - 6, y + h, w + 12, 5, _css("#cfcbc3"))


# --- facade ------------------------------------------------------------------------------------

func _facade(c: Node2D) -> void:
	const S := 256.0
	for lit: int in [0, CityAtlas.LIT]:
		for t in 4:
			var ox := (lit + t) * S
			_plaster(c, ox, S, [11, 18, 31, 47][t])
			match t:
				CityAtlas.TILE_WINDOW:
					_slab(c, ox)
					_window(c, ox + 70, 70, 116, 120)
				CityAtlas.TILE_BALCONY:
					_slab(c, ox)
					_window(c, ox + 86, 50, 84, 170)
					_rect(c, ox + 40, 210, 176, 10, _css("#d9d6d0"))
					var x := 46
					while x < 214:
						_rect(c, ox + x, 150, 3, 62, _rgba(40, 40, 40, 0.75))
						x += 12
					_rect(c, ox + 40, 148, 176, 4, _rgba(40, 40, 40, 0.75))
					_rect(c, ox + 196, 84, 44, 30, _css("#e9e9e6"))
					c.draw_circle(Vector2(ox + 218, 99), 10, _css("#9a9a96"))
				CityAtlas.TILE_DOOR:
					_window(c, ox + 28, 70, 84, 110)
					_rect(c, ox + 146, 60, 78, 196, _css("#3d2b1f"))
					_rect(c, ox + 152, 66, 66, 86, _css("#5a4130"))
					_rect(c, ox + 152, 160, 66, 90, _css("#5a4130"))
					_rect(c, ox + 160, 156, 6, 12, _css("#c9a44a"))
					_rect(c, ox, S - 18, S, 18, Color(0, 0, 0, 0.25))
				CityAtlas.TILE_SHOP:
					_rect(c, ox + 14, 62, 228, 186, _css("#6c7780"))
					var y := 66
					while y < 246:
						_rect(c, ox + 14, y, 228, 3, Color(0, 0, 0, 0.22))
						_rect(c, ox + 14, y + 4, 228, 1, Color(1, 1, 1, 0.10))
						y += 9
					_rect(c, ox + 14, 244, 228, 12, _css("#2b2f33"))
					_rect(c, ox + 10, 14, 236, 40, _css("#b9482f"))
					c.draw_rect(Rect2(ox + 14, 18, 228, 32), Color(1, 1, 1, 0.7), false, 2.0)


func _slab(c: Node2D, ox: float) -> void:
	_rect(c, ox, 256 - 12, 256, 12, Color(0, 0, 0, 0.12))
	_rect(c, ox, 256 - 14, 256, 2, Color(1, 1, 1, 0.25))


const GLASS := {0: [75, 75, 106, 110], 1: [91, 55, 74, 160], 2: [33, 75, 74, 100], 3: [14, 18, 228, 32]}


func _facade_glow(c: Node2D) -> void:
	_rect(c, 0, 0, 2048, 256, Color.BLACK)
	for tile: int in GLASS:
		var r: Array = GLASS[tile]
		var left := (tile + CityAtlas.LIT) * 256.0 + float(r[0])
		var y := float(r[1])
		var w := float(r[2])
		var h := float(r[3])
		var shop := tile == CityAtlas.TILE_SHOP
		_vgrad(c, left, y, w, h, _css("#fff1c8" if shop else "#ffd28a"), _css("#ffe0a0" if shop else "#e89a4a"))
		if shop:
			continue
		_rect(c, left + w / 2 - 4, y, 8, h, Color(0, 0, 0, 0.55))
		var bar := y + 9
		while bar < y + h - 1:
			_rect(c, left, bar, w, 2, Color(0, 0, 0, 0.55))
			bar += 12
		_rect(c, left + w * 0.62, y, w * 0.38, h, Color(0, 0, 0, 0.35))


# --- roof tiles --------------------------------------------------------------------------------

func _roof(c: Node2D) -> void:
	for row in 8:
		var y := row * 16.0
		_vgrad(c, 0, y, 128, 7.2, Color.WHITE, Color.WHITE)
		_vgrad(c, 0, y + 7.2, 128, 8.8, Color.WHITE, _css("#8a8a8a"))
		_rect(c, 0, y + 15, 128, 1, _rgba(40, 30, 25, 0.55))
		var x := 0 if row % 2 == 0 else 8
		while x < 128:
			_rect(c, x, y + 6, 1, 10, _rgba(40, 30, 25, 0.55))
			x += 16
	_seed(311)
	for i in 60:
		var a := 0.05 + _rand() * 0.08
		_rect(c, floorf(_rand() * 8) * 16 + 2, floorf(_rand() * 8) * 16 + 8, 12, 7, _rgba(60, 40, 30, a))


# --- ground atlas ------------------------------------------------------------------------------

func _ground(c: Node2D) -> void:
	const S := 256.0
	# Asphalt.
	var ox := CityAtlas.GROUND_ASPHALT * S
	_rect(c, ox, 0, S, S, _css("#4a4c52"))
	_grain(c, ox, S, 5000, 0.12, 5)
	_seed(9)
	for i in 5:
		var a := 0.08 + _rand() * 0.08
		_rect(c, ox + _rand() * (S - 50), _rand() * (S - 40), 20 + _rand() * 50, 14 + _rand() * 40, _rgba(20, 20, 22, a))
	for i in 4:
		var p := Vector2(_rand() * S, _rand() * S)
		for s in 6:
			var q := (p + Vector2((_rand() - 0.5) * 40, (_rand() - 0.5) * 40)).clamp(Vector2.ZERO, Vector2(S, S))
			c.draw_line(Vector2(ox, 0) + p, Vector2(ox, 0) + q, _rgba(15, 15, 15, 0.35), 1.0)
			p = q
	# Interlocking pavers (drawn at twice the TS scale: one tile is 3 m of verge).
	ox = CityAtlas.GROUND_PAVING * S
	_rect(c, ox, 0, S, S, _css("#a59e92"))
	var line := _rgba(70, 65, 58, 0.5)
	var y := 0
	while y <= 256:
		c.draw_line(Vector2(ox, y), Vector2(ox + S, y), line, 2.0)
		var x := 0 if (y / 32) % 2 == 0 else 32
		while x <= 256:
			c.draw_line(Vector2(ox + x, y), Vector2(ox + x, y + 32), line, 2.0)
			x += 64
		y += 32
	_grain(c, ox, S, 1800, 0.1, 21)
	# Grass.
	ox = CityAtlas.GROUND_GRASS * S
	_rect(c, ox, 0, S, S, _css("#5f9a4e"))
	_seed(101)
	for i in 2600:
		var light := _rand() >= 0.5
		var col := _rgba(150, 195, 105, 0.2 + _rand() * 0.3) if light else _rgba(40, 90, 35, 0.25 + _rand() * 0.3)
		var p := Vector2(_rand() * S, _rand() * S)
		c.draw_line(Vector2(ox, 0) + p, Vector2(ox, 0) + p + Vector2((_rand() - 0.5) * 3, -2 - _rand() * 4), col, 1.0)
	# Sand, water, paint.
	ox = CityAtlas.GROUND_SAND * S
	_rect(c, ox, 0, S, S, _css("#d9c494"))
	_grain(c, ox, S, 2500, 0.08, 61)
	_rect(c, CityAtlas.GROUND_WATER * S, 0, S, S, _css("#3f7fa6"))
	_rect(c, CityAtlas.GROUND_PAINT * S, 0, S, S, _css("#f0efe6"))
	# Kerb: a metre of yellow and a metre of black per tile (u = along / 2).
	ox = CityAtlas.GROUND_KERB * S
	_rect(c, ox, 0, S / 2, S, Color8(222, 186, 52))
	_rect(c, ox + S / 2, 0, S / 2, S, Color8(38, 38, 36))
	# Bare earth.
	ox = CityAtlas.GROUND_EARTH * S
	_rect(c, ox, 0, S, S, _css("#a58c66"))
	_seed(77)
	for i in 40:
		var x := _rand() * S
		var yy := _rand() * S
		var r := 10 + _rand() * 36
		var dark := _rand() < 0.5
		_blotch(c, ox + clampf(x, r, S - r), clampf(yy, r, S - r), r, _rgba(120, 100, 70, 0.22) if dark else _rgba(215, 200, 165, 0.22))
	_grain(c, ox, S, 3500, 0.1, 78)
	_road_tiles(c, S)


# --- kit atlas ---------------------------------------------------------------------------------

func _kit(c: Node2D) -> void:
	_rect(c, 0, 0, 1024, CityAtlas.CELL_Y, _css("#bdb8ae"))
	var table := SignCategories.load_file()
	for item in table.items:
		_sign(c, CityAtlas.sign_rect(int(item["id"])), item)
	_shutter(c, CityAtlas.KIT_SHUTTER)
	_interior(c, CityAtlas.KIT_LIT, 7)
	_interior(c, CityAtlas.KIT_DARK, 19)
	var d := CityAtlas.KIT_DARK
	_rect(c, d.position.x, d.position.y + 16, d.size.x, d.size.y - 16, _rgba(12, 10, 8, 0.62))
	_railing(c, CityAtlas.KIT_RAILING)
	var p := CityAtlas.KIT_PLAIN
	_rect(c, p.position.x, p.position.y, p.size.x, p.size.y, _css("#c9c4ba"))


## Text centred at (cx, baseline), squeezed to fit `max_width`.
func _fit(c: Node2D, font: Font, text: String, size: int, cx: float, baseline: float, max_width: float, col: Color) -> void:
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var squeeze := minf(1.0, max_width / w) if w > 0.0 else 1.0
	c.draw_set_transform(Vector2(cx - w * squeeze / 2.0, baseline), 0.0, Vector2(squeeze, 1.0))
	c.draw_string(font, Vector2.ZERO, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)
	c.draw_set_transform(Vector2.ZERO)


func _sign(c: Node2D, r: Rect2i, sign: Dictionary) -> void:
	var x := float(r.position.x)
	var y := float(r.position.y)
	var w := float(r.size.x)
	var h := float(r.size.y)
	var trim := _css(sign["trim"])
	_rect(c, x, y, w, h, _css(sign["board"]))
	_rect(c, x, y, w, 5, trim)
	_rect(c, x, y + h - 5, w, 5, trim)
	c.draw_rect(Rect2(x + 8, y + 9, w - 16, h - 18), trim, false, 2.0)
	_vgrad(c, x, y, w, h, Color(1, 1, 1, 0.12), Color(0, 0, 0, 0.08))
	var ink := _css(sign["ink"])
	var cx := x + w / 2.0
	if _tamil != null:
		_fit(c, _tamil, sign["tamil"], 34, cx, y + 41, w - 44, ink)
		_fit(c, _latin, sign["english"], 19, cx, y + 73, w - 60, ink)
	else:
		_fit(c, _latin, sign["english"], 40, cx, y + 58, w - 44, ink)


func _shutter(c: Node2D, r: Rect2i) -> void:
	var x := float(r.position.x)
	var y := float(r.position.y)
	var w := float(r.size.x)
	var h := float(r.size.y)
	_rect(c, x, y, w, h, _css("#ecebe6"))
	_rect(c, x, y, w, 16, Color(0, 0, 0, 0.42))
	var row := y + 18
	while row < y + h - 12:
		_rect(c, x, row, w, 3, Color(0, 0, 0, 0.22))
		_rect(c, x, row + 4, w, 1, Color(1, 1, 1, 0.35))
		row += 9
	_rect(c, x, y + h - 12, w, 12, Color(0, 0, 0, 0.5))
	_rect(c, x + w / 2 - 14, y + h - 24, 28, 6, _css("#555555"))
	_rect(c, x + 30, y + h - 26, 10, 14, _css("#8a6d2a"))
	_rect(c, x + w - 40, y + h - 26, 10, 14, _css("#8a6d2a"))
	for i in 6:
		_rect(c, x + 20 + i * 39, y + 20, 5, h * (0.3 + (i % 3) * 0.15), _rgba(110, 70, 40, 0.12))


func _interior(c: Node2D, r: Rect2i, s: int) -> void:
	var x := float(r.position.x)
	var y := float(r.position.y)
	var w := float(r.size.x)
	var h := float(r.size.y)
	_rect(c, x, y, w, h, _css("#d9cdb0"))
	_rect(c, x, y, w, 16, _css("#3b3b3b"))
	_rect(c, x + 40, y + 22, w - 80, 6, _css("#fbfbf2"))
	_seed(s)
	var goods := ["#c62828", "#f9a825", "#2e7d32", "#1565c0", "#ef6c00", "#6a1b9a", "#f5f5f5", "#00838f"]
	for shelf in 3:
		var top := y + 38 + shelf * 52
		_rect(c, x + 8, top + 42, w - 16, 5, _css("#7b5a3a"))
		var px := x + 10
		while px < x + w - 16:
			var bw := 10 + floorf(_rand() * 18)
			var bh := 18 + floorf(_rand() * 22)
			_rect(c, px, top + 42 - bh, bw, bh, _css(goods[floori(_rand() * goods.size())]))
			px += bw + 2
	_rect(c, x + 10, y + h - 54, w - 20, 54, _css("#6d4c2f"))
	_rect(c, x + 10, y + h - 54, w - 20, 5, Color(1, 1, 1, 0.18))


func _railing(c: Node2D, r: Rect2i) -> void:
	var x := float(r.position.x)
	var y := float(r.position.y)
	var w := float(r.size.x)
	var h := float(r.size.y)
	var col := _css("#34363a")
	_rect(c, x, y + 4, w, 9, col)
	_rect(c, x, y + h - 12, w, 8, col)
	_rect(c, x, y + h / 2 - 2, w, 4, col)
	var px := x + 4
	while px < x + w:
		_rect(c, px, y + 4, 4, h - 8, col)
		px += 16


## Glow partner of the kit: the lit shop interior strong, the signboards faint.
func _kit_glow(kit: Image) -> Image:
	var out := Image.create(CityAtlas.KIT_PX, CityAtlas.KIT_H, false, Image.FORMAT_RGB8)
	out.fill(Color.BLACK)
	var lit := CityAtlas.KIT_LIT
	for y in CityAtlas.KIT_H:
		var in_signs := y < CityAtlas.CELL_Y
		for x in 1024:
			var strength := 0.0
			if in_signs:
				strength = 0.3
			elif lit.has_point(Vector2i(x, y)):
				strength = 0.7
			if strength == 0.0:
				continue
			var k := kit.get_pixel(x, y)
			var col := Color(k.r * strength, k.g * strength, k.b * strength)
			if strength == 0.7 and y >= lit.position.y + 16:
				col += Color(1.0, 0.84, 0.59) * 0.2
			out.set_pixel(x, y, col)
	return out


# --- road detail tiles (G-310 to G-312) ---------------------------------------------------------

## Tiles 8 to 15: sun-bleached asphalt with patches and cracks, cement concrete with joints,
## footpath slabs, red laterite dust, the black-and-white kerb, dark iron and tar, yellow paint,
## faded white paint. Original, painted here (no photo or third-party picture is used).
func _road_tiles(c: Node2D, s: float) -> void:
	# Worn asphalt: lighter, rougher, with darker repair patches, crack networks and oil stains.
	var ox := 8 * s
	_rect(c, ox, 0, s, s, _css("#57585c"))
	_grain(c, ox, s, 9000, 0.16, 301)
	_seed(302)
	for i in 6:
		_blotch(c, ox + 30 + _rand() * (s - 60), 30 + _rand() * (s - 60), 18 + _rand() * 26, _rgba(25, 25, 28, 0.20 + _rand() * 0.15))
	for i in 1:
		# A repair patch: a darker rectangle with a hairline edge.
		var w := 40 + _rand() * 50
		var h := 30 + _rand() * 40
		var px := ox + 10 + _rand() * (s - w - 20)
		var py := 10 + _rand() * (s - h - 20)
		_rect(c, px, py, w, h, _rgba(40, 40, 44, 0.22))
	for i in 7:
		var p := Vector2(_rand() * s, _rand() * s)
		for k in 9:
			var q := (p + Vector2((_rand() - 0.3) * 34, (_rand() - 0.5) * 34)).clamp(Vector2.ZERO, Vector2(s, s))
			c.draw_line(Vector2(ox, 0) + p, Vector2(ox, 0) + q, _rgba(14, 14, 14, 0.55), 1.4)
			p = q
	# Concrete lane: panels with tar-filled joints, polished wheel tracks, stains.
	ox = 9 * s
	_rect(c, ox, 0, s, s, _css("#a9a79f"))
	_grain(c, ox, s, 6000, 0.12, 311)
	_seed(312)
	for i in 8:
		_blotch(c, ox + _rand() * s, _rand() * s, 14 + _rand() * 30, _rgba(90, 84, 70, 0.14))
	c.draw_line(Vector2(ox, s / 2), Vector2(ox + s, s / 2), _rgba(40, 38, 34, 0.75), 3.0)
	c.draw_line(Vector2(ox + 2, 0), Vector2(ox + 2, s), _rgba(40, 38, 34, 0.6), 3.0)
	c.draw_line(Vector2(ox + s - 1, 0), Vector2(ox + s - 1, s), _rgba(40, 38, 34, 0.6), 3.0)
	for i in 3:
		var p := Vector2(_rand() * s, _rand() * s)
		for k in 5:
			var q := (p + Vector2((_rand() - 0.5) * 30, (_rand() - 0.5) * 30)).clamp(Vector2.ZERO, Vector2(s, s))
			c.draw_line(Vector2(ox, 0) + p, Vector2(ox, 0) + q, _rgba(50, 48, 44, 0.5), 1.2)
			p = q
	# Footpath slabs: a 4 x 4 grid of cement slabs (tile = 2.4 m), shade varies per slab, a few
	# chipped or cracked, one missing (bare dust), the grout dark.
	ox = 10 * s
	_rect(c, ox, 0, s, s, _css("#97948b"))
	_seed(321)
	var cell := s / 4.0
	for gy in 4:
		for gx in 4:
			var shade := 0.95 + _rand() * 0.1
			var base := Color(0.72 * shade, 0.70 * shade, 0.66 * shade)
			var missing := (gx * 7 + gy * 3) % 11 == 5
			if missing:
				base = Color(0.46, 0.42, 0.38)
			_rect(c, ox + gx * cell + 2, gy * cell + 2, cell - 4, cell - 4, base)
			if not missing and _rand() < 0.35:
				var a := Vector2(ox + gx * cell + 6 + _rand() * (cell - 12), gy * cell + 6)
				var b := Vector2(ox + gx * cell + 6 + _rand() * (cell - 12), gy * cell + cell - 6)
				c.draw_line(a, b, _rgba(40, 38, 34, 0.7), 1.5)
			if not missing and _rand() < 0.2:
				_blotch(c, ox + gx * cell + _rand() * cell, gy * cell + _rand() * cell, 10, _rgba(60, 50, 40, 0.3))
	_grain(c, ox, s, 3000, 0.1, 322)
	# Laterite: red-brown dust with pebbles.
	ox = 11 * s
	_rect(c, ox, 0, s, s, _css("#966249"))
	_seed(331)
	for i in 50:
		var r := 10 + _rand() * 34
		_blotch(c, ox + clampf(_rand() * s, r, s - r), clampf(_rand() * s, r, s - r), r, _rgba(110, 72, 52, 0.25) if _rand() < 0.5 else _rgba(190, 150, 120, 0.22))
	_grain(c, ox, s, 4000, 0.14, 332)
	# Kerb stones painted black and white (u = along / 2: one metre each, like the yellow kerb).
	ox = 12 * s
	_rect(c, ox, 0, s / 2, s, Color8(216, 214, 204))
	_rect(c, ox + s / 2, 0, s / 2, s, Color8(34, 34, 36))
	_grain(c, ox, s, 1500, 0.1, 341)
	# Dark iron and tar: manhole covers, potholes, drain gratings.
	ox = 13 * s
	_rect(c, ox, 0, s, s, _css("#1d1c1e"))
	_grain(c, ox, s, 1500, 0.1, 351)
	# Yellow and faded white paint.
	_rect(c, 14 * s, 0, s, s, _css("#e0b92c"))
	_rect(c, 15 * s, 0, s, s, _css("#bdbab0"))
	_grain(c, 15 * s, s, 800, 0.1, 361)
