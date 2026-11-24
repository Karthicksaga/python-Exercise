class_name QualityApplier
extends RefCounted
## Applies a quality preset's values (`QualitySettings.TABLE`) to the engine, live (G-252):
## the viewport (3D resolution scale and mode, MSAA, anisotropic filtering, mesh LOD threshold,
## positional shadow atlas), frame cap and physics catch-up steps, the sun's shadows, the haze and
## the camera's far plane, the streamer's distances and workers, the rain and the street lights.
## The HUD and touch controls are 2D and stay at the screen's own resolution: only the 3D buffer
## is scaled.

## The renderer in use: "forward_plus", "mobile" or "gl_compatibility".
static func method() -> String:
	return RenderingServer.get_current_rendering_method()


static func apply_viewport(vp: Viewport, v: Dictionary) -> void:
	var scale := clampf(float(v["scale"]), 0.25, 1.0)
	vp.scaling_3d_scale = scale
	# FSR 1 needs the RenderingDevice renderers; Compatibility only scales bilinearly.
	var fsr := int(v["scale_mode"]) == QualitySettings.FSR1 and method() != "gl_compatibility" and scale < 0.999
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR if fsr else Viewport.SCALING_3D_MODE_BILINEAR
	vp.msaa_3d = Viewport.MSAA_2X if int(v["msaa"]) >= 1 else Viewport.MSAA_DISABLED
	vp.anisotropic_filtering_level = [Viewport.ANISOTROPY_DISABLED, Viewport.ANISOTROPY_2X, Viewport.ANISOTROPY_4X][clampi(int(v["aniso"]), 0, 2)]
	vp.mesh_lod_threshold = float(v["lod_threshold"])
	# No light in the game casts positional shadows: the atlas is memory and a clear for nothing.
	vp.positional_shadow_atlas_size = 0


static var _shadow_size: int = -1
static var _soft_quality: int = -1


static func apply_engine(v: Dictionary) -> void:
	Engine.max_fps = int(v["max_fps"])
	Engine.max_physics_steps_per_frame = int(v["physics_steps"])
	# Only when they change: `apply` runs at every state change, and these two rebuild the shadow
	# atlas or change a shader specialization (pipelines compiled again), G-346.
	var size := int(v["shadow_size"])
	if size != _shadow_size:
		_shadow_size = size
		RenderingServer.directional_shadow_atlas_set_size(size, true)
	# Hard shadows on Low and Medium: one shadow-map tap a pixel instead of a dozen (G-342).
	var quality := RenderingServer.SHADOW_QUALITY_SOFT_LOW if bool(v["soft_shadows"]) else RenderingServer.SHADOW_QUALITY_HARD
	if quality != _soft_quality:
		_soft_quality = quality
		RenderingServer.directional_soft_shadow_filter_set_quality(quality)


## The city's shared materials: per-vertex lighting on Low (G-342).
static func apply_materials(m: CityMaterials, v: Dictionary) -> void:
	if m != null:
		m.set_flat(bool(v["vertex_lighting"]))


static func apply_sun(sun: DirectionalLight3D, v: Dictionary, switched_on: bool = true) -> void:
	if sun == null:
		return
	var on := bool(v["shadows"]) and switched_on
	sun.shadow_enabled = on
	if on:
		sun.directional_shadow_max_distance = float(v["shadow_distance"])


static func apply_streamer(s: ChunkStreamer, v: Dictionary) -> void:
	if s == null:
		return
	s.load_distance = float(v["load_distance"])
	s.unload_distance = float(v["unload_distance"])
	s.near_distance = float(v["near_distance"])
	s.in_flight = clampi(int(v["workers"]), 1, maxi(1, OS.get_processor_count() - 1))


static func apply_environment(env: CityEnvironment, v: Dictionary) -> void:
	if env == null:
		return
	env.fog_far = float(v["fog_far"])
	env.rain.density = float(v["rain"])
	env.street_lights.pool = int(v["street_lights"])


static func apply_camera(cam: Camera3D, v: Dictionary) -> void:
	if cam != null:
		cam.far = float(v["camera_far"])
