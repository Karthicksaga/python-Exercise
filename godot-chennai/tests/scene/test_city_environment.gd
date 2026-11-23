extends TestCase
## Day, night and weather in the scene (G-86…G-88): the sun follows the clock, the haze and
## exposure follow the look, the rain toggles and fades in game time, the ground looks wet, the
## street lights come on at night within the light budget, and weather adds at most one draw call.

const SETTINGS := "user://test_weather_save.json"

var env: CityEnvironment
var old_hour: float
var old_settings: String


func before_each() -> void:
	old_hour = GameLoop.clock.hour
	old_settings = Weather.settings_path
	Weather.settings_path = SETTINGS
	Weather.set_raining(false, true, false)
	var camera := Camera3D.new()
	root.add_child(camera)
	camera.make_current()
	env = CityEnvironment.new(true)
	env.camera = camera
	root.add_child(env)
	var lamps := PackedVector3Array()
	for i in 12:
		lamps.append(Vector3(i * 25.0 - 140.0, 0.0, -7.0))
	env.street_lights.set_lamps(lamps)
	await wait_frames(1)


func _at(hour: float) -> void:
	GameLoop.clock.hour = hour
	env._apply(true)


func _restore() -> void:
	GameLoop.clock.hour = old_hour
	Weather.set_raining(false, true, false)
	Weather.settings_path = old_settings


func test_sun_sky_and_haze_follow_the_hour() -> bool:
	_at(17.75)
	var golden_down := -env.sun.global_basis.z
	assert_true(golden_down.y < 0.0, "the sun shines down")
	assert_true(golden_down.x > 0.8, "from the west, towards the east (%.2f)" % golden_down.x)
	assert_eq(env.environment.fog_light_color, env.look.horizon, "the haze is the horizon colour")
	var golden_begin := env.environment.fog_depth_begin
	var golden_energy := env.sun.light_energy
	_at(12.5)
	assert_true(-env.sun.global_basis.z.y < -0.85, "high noon sun")
	assert_true(env.environment.fog_depth_begin > golden_begin, "clearer at noon: the haze starts further out")
	assert_true(env.environment.fog_depth_end <= CityEnvironment.FOG_FAR, "but always hides the streaming edge")
	_at(21.5)
	assert_true(env.sun.light_energy < golden_energy / 4.0, "dim moonlight at night")
	assert_true(env.environment.tonemap_exposure > 1.2, "exposure lifts the night")
	assert_eq(env.sun.directional_shadow_mode, DirectionalLight3D.SHADOW_ORTHOGONAL, "one cheap shadow split")
	assert_true(env.sun.directional_shadow_max_distance <= 40.0, "shadows only near the player")
	assert_eq(env.environment.reflected_light_source, Environment.REFLECTION_SOURCE_DISABLED, "no sky radiance on the phone budget")
	_restore()
	return true


func test_street_lights_at_night_within_the_budget() -> bool:
	_at(12.5)
	env._process(0.3)
	assert_eq(env.street_lights.lit_lights(), 0, "no lamps lit at noon")
	_at(21.5)
	env._process(0.3)
	assert_eq(env.street_lights.lit_lights(), StreetLights.POOL, "the nearest few lamps light the street")
	assert_true(StreetLights.POOL <= 6, "at most six real lights")
	for light in env.street_lights.lights:
		check(not light.shadow_enabled, "street lights cast no shadows")
	assert_true(env.street_lights.lamps.size() > StreetLights.POOL, "more lamps than real lights: the rest only glow")
	_restore()
	return true


func test_rain_toggles_fades_in_game_time_and_wets_the_ground() -> bool:
	var ground := StandardMaterial3D.new()
	ground.roughness = 0.95
	ground.albedo_color = Color(0.56, 0.5, 0.42)
	env.register_wet(ground)
	_at(17.75)
	env._process(0.016)
	assert_false(env.rain.visible, "dry: no rain drawn")
	Weather.set_raining(true, false, false)
	assert_eq(Weather.label(), "Weather: Rain", "menu label")
	await wait_game_seconds(1.0)
	assert_true(Weather.rain_level() > 0.2 and Weather.rain_level() < 0.6, "fading in (%.2f)" % Weather.rain_level())
	await wait_game_seconds(2.0)
	assert_eq(Weather.rain_level(), 1.0, "raining after the fade")
	env._process(0.016)
	assert_true(env.rain.visible, "streaks round the camera")
	assert_true(RenderingServer.global_shader_parameter_get_list().has(WeatherService.WETNESS_PARAM), "road shaders can read the wet (global uniform)")
	assert_eq(Weather.published_wetness, 1.0, "and it is set")
	assert_true(ground.roughness < 0.4, "the ground is glossy when wet")
	assert_true(env.look.light_intensity < Lighting.at(17.75).light_intensity * 0.5, "the sun dims in the rain")
	Weather.set_raining(false, false, false)
	await wait_game_seconds(3.0)
	env._process(0.016)
	assert_false(env.rain.visible, "dry again: no draw call")
	assert_near(ground.roughness, 0.95, 0.001, "and the ground dries")
	_restore()
	return true


func test_weather_costs_at_most_one_draw_call() -> bool:
	# Count what the weather adds to the scene: visible geometry instances and lights.
	var geometry := func() -> int:
		var n := 0
		for node in env.find_children("*", "GeometryInstance3D", true, false):
			if (node as GeometryInstance3D).is_visible_in_tree():
				n += 1
		return n
	_at(17.75)
	env._process(0.016)
	var dry: int = geometry.call()
	Weather.set_raining(true, true, false)
	env._process(0.016)
	var wet: int = geometry.call()
	assert_eq(wet - dry, 1, "rain is one mesh (one draw call)")
	assert_eq(env.rain.drops, CityEnvironment.RAIN_DROPS, "every drop in that mesh")
	assert_true(env.rain.mesh.get_surface_count() == 1, "one surface")
	# Lamp heads and the stand-in poles are one MultiMesh each, however many lamps.
	assert_true(dry <= 2, "street lights draw in at most two calls (%d)" % dry)
	_restore()
	return true
