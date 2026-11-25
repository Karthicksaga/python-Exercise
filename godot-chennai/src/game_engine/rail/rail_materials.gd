class_name RailMaterials
extends RefCounted
## The railway's few materials (G-325): one vertex-coloured material with a small texture made
## here (ballast stones with concrete sleepers across, beside a plain white patch for everything
## else), so a chunk of track, its masts and the viaduct are one draw call; and the materials for
## platforms and boards. Made on the main thread (a material set up on a worker lost its
## parameters under the Compatibility renderer, G-52); the texture is original, drawn by code.

## Where in the texture the ballast strip lies across (u) and the white patch.
const BALLAST_U0 := 0.03
const BALLAST_U1 := 0.47
const WHITE_U := 0.75
## Metres of track per repeat of the texture's sleeper pattern (one sleeper every 0.65 m, two per repeat).
const SLEEPER_REPEAT := 1.3

var track: StandardMaterial3D
## Unlit board faces drawn by Label3D sit on these.
var board: StandardMaterial3D
var platform: StandardMaterial3D
var glow: StandardMaterial3D


static func create() -> RailMaterials:
	var m := RailMaterials.new()
	m.track = StandardMaterial3D.new()
	m.track.vertex_color_use_as_albedo = true
	m.track.vertex_color_is_srgb = true
	m.track.albedo_texture = _texture()
	m.track.roughness = 0.9
	m.track.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	m.platform = StandardMaterial3D.new()
	m.platform.vertex_color_use_as_albedo = true
	m.platform.vertex_color_is_srgb = true
	m.platform.roughness = 0.85
	m.board = StandardMaterial3D.new()
	m.board.vertex_color_use_as_albedo = true
	m.board.vertex_color_is_srgb = true
	m.board.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.glow = StandardMaterial3D.new()
	m.glow.vertex_color_use_as_albedo = true
	m.glow.vertex_color_is_srgb = true
	m.glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return m


## 128 × 64: u 0..0.5 ballast with two sleepers along v, u 0.5..1 white. Deterministic noise.
static func _texture() -> ImageTexture:
	var w := 128
	var h := 64
	var img := Image.create(w, h, true, Image.FORMAT_RGB8)
	var seed_value := 7
	for y in h:
		for x in w:
			var c := Color(1, 1, 1)
			if x < w / 2:
				seed_value = (seed_value * 1103515245 + 12345) & 0x7FFFFFFF
				var n := float(seed_value % 1000) / 1000.0
				# Grey granite ballast, a little brown from the dust.
				var g := 0.42 + 0.22 * n
				c = Color(g * 1.02, g * 0.98, g * 0.92)
				# Concrete sleepers: two per repeat, each a quarter of the length, across the middle 80 %.
				var along := float(y % (h / 2)) / (h / 2.0)
				var across := float(x) / (w / 2.0)
				if along > 0.36 and along < 0.64 and across > 0.1 and across < 0.9:
					var k := 0.68 + 0.06 * n
					c = Color(k, k * 0.98, k * 0.94)
					if along < 0.4 or along > 0.6:
						c = c.darkened(0.25)
			img.set_pixel(x, y, c)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)
