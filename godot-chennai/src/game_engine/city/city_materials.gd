class_name CityMaterials
extends RefCounted
## Materials shared by every chunk, created once (decision G-52): one per atlas, so a chunk is
## a handful of draw calls whatever it holds. Textures are baked PNGs
## (`tools/bake_city_textures.gd`); a missing texture leaves the vertex colours alone, so the
## city still draws (and tests run) before a bake.
##
## `set_night` and `set_wet` are the hooks for the time of day and weather (owned by the
## environment work): windows and shops glow after dark, paved ground darkens in the rain.

const GROUND_SHADER := preload("res://src/game_engine/city/shaders/ground.gdshader")

var walls: StandardMaterial3D
var roofs: StandardMaterial3D
var kit: StandardMaterial3D
var ground: ShaderMaterial
## Vertex colours only: street furniture, props, far buildings.
var objects: StandardMaterial3D
## Trees and palms: vertex colours, both sides (fronds are seen from below).
var foliage: StandardMaterial3D
var landmark: StandardMaterial3D
var water: StandardMaterial3D
## Textures that were found, by file name.
var loaded: PackedStringArray = PackedStringArray()


static func _texture(name: String, out: PackedStringArray) -> Texture2D:
	var path := CityAtlas.DIR.path_join(name)
	if not ResourceLoader.exists(path):
		return null
	var t := load(path) as Texture2D
	if t != null:
		out.append(name)
	return t


static func _vertex_coloured(roughness: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = roughness
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	return m


static func create() -> CityMaterials:
	var c := CityMaterials.new()
	c.walls = _vertex_coloured(0.93)
	c.walls.albedo_texture = _texture("facade.png", c.loaded)
	c.walls.texture_repeat = false
	var glow := _texture("facade_glow.png", c.loaded)
	if glow != null:
		c.walls.emission_enabled = true
		c.walls.emission_texture = glow
		c.walls.emission = Color.BLACK  # Godot adds the colour to the texture: black leaves only the lit glass
		c.walls.emission_energy_multiplier = 0.0
	c.roofs = _vertex_coloured(1.0)
	c.roofs.albedo_texture = _texture("roof_tiles.png", c.loaded)
	c.roofs.cull_mode = BaseMaterial3D.CULL_DISABLED
	c.kit = _vertex_coloured(0.8)
	c.kit.albedo_texture = _texture("kit.png", c.loaded)
	c.kit.texture_repeat = false
	c.kit.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	c.kit.alpha_scissor_threshold = 0.5
	c.kit.cull_mode = BaseMaterial3D.CULL_DISABLED
	var kit_glow := _texture("kit_glow.png", c.loaded)
	if kit_glow != null:
		c.kit.emission_enabled = true
		c.kit.emission_texture = kit_glow
		c.kit.emission = Color.BLACK
		c.kit.emission_energy_multiplier = 0.0
	c.ground = ShaderMaterial.new()
	c.ground.shader = GROUND_SHADER
	var atlas := _texture("ground.png", c.loaded)
	if atlas == null:
		atlas = _fallback_ground()
	c.ground.set_shader_parameter("atlas", atlas)
	c.ground.set_shader_parameter("tiles", float(CityAtlas.GROUND_TILES))
	c.objects = _vertex_coloured(0.85)
	c.foliage = _vertex_coloured(0.9)
	c.foliage.cull_mode = BaseMaterial3D.CULL_DISABLED
	c.landmark = _vertex_coloured(0.82)
	c.water = StandardMaterial3D.new()
	c.water.albedo_color = Color.hex(0x3f7fa6ff)
	c.water.roughness = 0.2
	return c


## Plain colours per ground layer, used until the atlas is baked.
static func _fallback_ground() -> ImageTexture:
	var colours: Array[Color] = [Color.hex(0x4a4c52ff), Color.hex(0xb9b2a6ff), Color.hex(0x5f9a4eff), Color.hex(0xe9d6a6ff), Color.hex(0x3f7fa6ff), Color.hex(0xf0efe6ff), Color.hex(0xdeba34ff), Color.hex(0xb9a37cff)]
	var img := Image.create(CityAtlas.GROUND_TILES * 4, 4, false, Image.FORMAT_RGB8)
	for i in colours.size():
		img.fill_rect(Rect2i(i * 4, 0, 4, 4), colours[i])
	return ImageTexture.create_from_image(img)


## 0 by day, 1 at night: lit windows and open shops glow.
func set_night(night: float) -> void:
	walls.emission_energy_multiplier = night * 1.15
	kit.emission_energy_multiplier = night * 1.15


## 0 dry, 1 soaked.
func set_wet(wet: float) -> void:
	ground.set_shader_parameter("wet", wet)
	var shade := 1.0 - 0.12 * wet
	walls.albedo_color = Color(shade, shade, shade)
	roofs.roughness = 1.0 - 0.45 * wet
