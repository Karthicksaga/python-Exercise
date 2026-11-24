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
const WATER_SHADER := preload("res://src/game_engine/city/shaders/water.gdshader")

var walls: StandardMaterial3D
var roofs: StandardMaterial3D
var kit: StandardMaterial3D
var ground: ShaderMaterial
## Vertex colours only: street furniture, props, far buildings.
var objects: StandardMaterial3D
## Trees and palms: vertex colours, both sides (fronds are seen from below).
var foliage: StandardMaterial3D
var landmark: StandardMaterial3D
## Rivers, canals, ponds (G-152): `water.gdshader`.
var water: ShaderMaterial
## Bridges, flyovers, ramps, covers (G-151): vertex colours, both sides.
var decks: StandardMaterial3D
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
	# No specular term on the city's rough surfaces (G-343): at roughness 0.8-1 it adds almost
	# nothing by day, costs a GGX evaluation a pixel, and is the suspect for the single-pixel white
	# dots the owner's Adreno 613 drew on window glass and walls (half-precision specular).
	m.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
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
	c.decks = _vertex_coloured(0.9)
	c.decks.cull_mode = BaseMaterial3D.CULL_DISABLED
	c.water = ShaderMaterial.new()
	c.water.shader = WATER_SHADER
	return c


## Plain colours per ground layer, used until the atlas is baked.
static func _fallback_ground() -> ImageTexture:
	var colours: Array[Color] = [Color.hex(0x4a4c52ff), Color.hex(0xb9b2a6ff), Color.hex(0x5f9a4eff), Color.hex(0xe9d6a6ff), Color.hex(0x3f7fa6ff), Color.hex(0xf0efe6ff), Color.hex(0xdeba34ff), Color.hex(0xb9a37cff)]
	var img := Image.create(CityAtlas.GROUND_TILES * 4, 4, false, Image.FORMAT_RGB8)
	for i in colours.size():
		img.fill_rect(Rect2i(i * 4, 0, 4, 4), colours[i])
	return ImageTexture.create_from_image(img)


## Lighting per vertex instead of per pixel (the Low preset, G-342): the city is flat walls,
## roofs and ground whose normals do not change across a face, so the sun and the ambient light
## look the same; the pixel shaders lose their lighting loop and the specular term (the glossy
## glint on the ground and walls). Shadows are still sampled per pixel. Live: the ground and water
## swap to a vertex-lit copy of their shader (made once, on first use).
var flat: bool = false
static var _vertex_shaders: Dictionary[Shader, Shader] = {}


func set_flat(on: bool) -> void:
	if on == flat:
		return
	flat = on
	var mode := BaseMaterial3D.SHADING_MODE_PER_VERTEX if on else BaseMaterial3D.SHADING_MODE_PER_PIXEL
	for m: StandardMaterial3D in [walls, roofs, kit, objects, foliage, landmark, decks]:
		if m != null:
			m.shading_mode = mode
	ground.shader = vertex_lit(GROUND_SHADER) if on else GROUND_SHADER
	water.shader = vertex_lit(WATER_SHADER) if on else WATER_SHADER


## A copy of `shader` lit per vertex, without the specular term (cached).
static func vertex_lit(shader: Shader) -> Shader:
	if not _vertex_shaders.has(shader):
		var copy := Shader.new()
		copy.code = shader.code.replace("render_mode ", "render_mode vertex_lighting, ").replace("specular_schlick_ggx", "specular_disabled")
		_vertex_shaders[shader] = copy
	return _vertex_shaders[shader]


## 0 by day, 1 at night: lit windows and open shops glow.
func set_night(night: float) -> void:
	walls.emission_energy_multiplier = night * 1.15
	kit.emission_energy_multiplier = night * 1.15


## 0 dry, 1 soaked.
func set_wet(wet: float) -> void:
	ground.set_shader_parameter("wet", wet)
	water.set_shader_parameter("wet", wet)
	var shade := 1.0 - 0.12 * wet
	walls.albedo_color = Color(shade, shade, shade)
	roofs.roughness = 1.0 - 0.45 * wet
