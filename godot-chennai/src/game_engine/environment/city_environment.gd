class_name CityEnvironment
extends Node3D
## Day, night and weather in the scene (decisions G-86…G-88): the sun (or moon) with shadows only
## near the camera, flat ambient light, the sky, the haze that hides the streaming edge, exposure,
## rain streaks round the camera, sodium street lights at night and the wet look. It reads the
## time of day from `GameLoop.clock` and the rain from `Weather`; it has no state of its own
## beyond the place's haze. Add one to the world scene (it replaces a static WorldEnvironment and
## sun); `register_wet()` the ground and road materials.
##
## Phone budget (Mobile renderer, Adreno 613): one orthogonal directional shadow 40 m round the
## camera, no sky reflections or radiance, rain one draw call (none when dry), lamp heads one
## draw call, at most six omni lights.

const SKY_SHADER := preload("res://src/game_engine/environment/sky.gdshader")
## Light units: the Three.js intensities and Godot's energies differ by about this much for the
## same picture (tuned on the Compatibility screenshots).
const SUN_ENERGY := 0.42
const AMBIENT_ENERGY := 0.62
const FOG_NEAR := 90.0
const FOG_FAR := 340.0
const SHADOW_REACH := 40.0
const RAIN_DROPS := 1100
## Re-apply the look when the hour moves this much (half a game minute) or the rain changes.
const HOUR_STEP := 1.0 / 120.0

## The camera to follow (rain, lights, shadows); defaults to the viewport's current camera.
var camera: Camera3D = null
## 1 inland; above 1 thickens the haze (sea haze near the coast).
var place_haze: float = 1.0

var look: Lighting.Look = Lighting.at(Lighting.DEFAULT_HOUR)
var sun: DirectionalLight3D
var world_environment: WorldEnvironment
var environment: Environment
var rain: RainView
var street_lights: StreetLights

var _sky_material: ShaderMaterial
var _applied_hour: float = -100.0
var _applied_rain: float = -1.0
var _applied_haze: float = -1.0
var _wet: Array[BaseMaterial3D] = []


func _init(with_poles: bool = false) -> void:
	name = "CityEnvironment"
	environment = Environment.new()
	environment.background_mode = Environment.BG_SKY
	_sky_material = ShaderMaterial.new()
	_sky_material.shader = SKY_SHADER
	var sky := Sky.new()
	sky.sky_material = _sky_material
	sky.radiance_size = Sky.RADIANCE_SIZE_32
	sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.fog_enabled = true
	environment.fog_mode = Environment.FOG_MODE_DEPTH
	environment.fog_density = 1.0
	environment.fog_depth_curve = 1.0
	environment.fog_sky_affect = 0.0
	environment.fog_light_energy = 1.0
	world_environment = WorldEnvironment.new()
	world_environment.environment = environment
	add_child(world_environment)
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = SHADOW_REACH
	sun.shadow_bias = 0.05
	sun.shadow_normal_bias = 1.5
	sun.shadow_blur = 1.5
	add_child(sun)
	rain = RainView.new(RAIN_DROPS)
	add_child(rain)
	street_lights = StreetLights.new(with_poles)
	add_child(street_lights)


func _ready() -> void:
	_apply(true)


## Make a ground or road material look wet in the rain (darker, glossier).
func register_wet(material: BaseMaterial3D) -> void:
	if material == null or _wet.has(material):
		return
	material.set_meta(&"dry_roughness", material.roughness)
	material.set_meta(&"dry_albedo", material.albedo_color)
	_wet.append(material)
	_apply_wet(Weather.rain_level())


func set_haze(amount: float) -> void:
	place_haze = clampf(amount if not is_nan(amount) else 1.0, 0.5, 3.0)


func _process(dt: float) -> void:
	_apply(false)
	var cam := camera if camera != null else get_viewport().get_camera_3d()
	var at := cam.global_position if cam != null else Vector3.ZERO
	rain.step(dt, at, Weather.rain_level(), look.night)
	street_lights.step(dt, at, look.night)


## Turn the clock, the rain and the place into lights, sky, fog and exposure.
func _apply(force: bool) -> void:
	var clock: GameClock = GameLoop.clock
	var hour := clock.hour
	var wet := Weather.rain_level()
	var moved := absf(hour - _applied_hour)
	if not force and minf(moved, 24.0 - moved) < HOUR_STEP and absf(wet - _applied_rain) < 0.01 and place_haze == _applied_haze:
		return
	_applied_hour = hour
	_applied_rain = wet
	_applied_haze = place_haze
	look = Lighting.at(hour, wet)
	sun.light_color = look.light_color
	sun.light_energy = look.light_intensity * SUN_ENERGY
	# Godot lights shine along their -Z: point it from the light towards the ground.
	sun.basis = Basis.looking_at(-look.light, Vector3.FORWARD if absf(look.light.y) > 0.999 else Vector3.UP)
	environment.ambient_light_color = look.hemi_sky.lerp(look.hemi_ground, 0.3)
	environment.ambient_light_energy = look.hemi_intensity * AMBIENT_ENERGY
	environment.tonemap_exposure = look.exposure
	environment.fog_light_color = look.horizon
	var haze := look.haze * place_haze
	environment.fog_depth_begin = FOG_NEAR / haze
	environment.fog_depth_end = FOG_FAR / (1.0 + (haze - 1.0) * 0.6)
	_sky_material.set_shader_parameter(&"zenith", look.zenith)
	_sky_material.set_shader_parameter(&"horizon", look.horizon)
	_sky_material.set_shader_parameter(&"ground", look.hemi_ground)
	_sky_material.set_shader_parameter(&"glow", look.glow)
	_sky_material.set_shader_parameter(&"glow_strength", look.glow_strength)
	_sky_material.set_shader_parameter(&"sun_dir", look.sun_sky)
	_sky_material.set_shader_parameter(&"sun_disc", look.sun_disc)
	_sky_material.set_shader_parameter(&"moon_dir", look.moon)
	_sky_material.set_shader_parameter(&"moonlight", look.moonlight)
	RenderingServer.global_shader_parameter_set(WeatherService.NIGHT_PARAM, look.night)
	_apply_wet(wet)


func _apply_wet(wet: float) -> void:
	for m in _wet:
		var dry_r: float = m.get_meta(&"dry_roughness", 0.9)
		var dry_c: Color = m.get_meta(&"dry_albedo", Color.WHITE)
		m.roughness = lerpf(dry_r, 0.18, wet * 0.85)
		m.albedo_color = dry_c.darkened(0.28 * wet)
