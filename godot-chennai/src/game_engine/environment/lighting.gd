class_name Lighting
extends RefCounted
## The look of the city by time of day and weather, as plain numbers (the Three.js `lighting.ts`,
## decision G-86). Pure: `CityEnvironment` turns a `Look` into the sun, ambient, sky, fog and
## exposure. Colours are sRGB.
##
## The sun's path is a game path, not an almanac: it rises in the east (+X) around 06:00, passes
## high in the south (+Z) and sets in the west around 18:45, so 17:45 (the default start) is a
## low, warm golden-hour sun with long shadows. Coordinates: +X east, -Z north (TD-2).


class Look:
	var hour: float = 17.75
	var rain: float = 0.0
	## Direction from the ground towards the light that casts shadows (sun by day, moon at night).
	var light: Vector3 = Vector3.UP
	var light_color: Color = Color.WHITE
	var light_intensity: float = 1.0
	## Where the sun really is (may be below the horizon), for the sky glow.
	var sun_sky: Vector3 = Vector3.UP
	var sun_disc: float = 0.0
	var moon: Vector3 = Vector3.UP
	var moonlight: float = 0.0
	var hemi_sky: Color = Color.WHITE
	var hemi_ground: Color = Color.GRAY
	var hemi_intensity: float = 1.0
	var zenith: Color = Color.BLUE
	## Horizon colour, also the fog colour (the haze hides the streaming edge).
	var horizon: Color = Color.WHITE
	var glow: Color = Color.BLACK
	var glow_strength: float = 0.0
	var exposure: float = 1.0
	var environment: float = 0.45
	## 0 by day, 1 at night: lamps, lit windows and headlight pools follow it.
	var night: float = 0.0
	## Fog thickness multiplier: 1 is a clear noon; above 1 the haze starts nearer.
	var haze: float = 1.0


const DEFAULT_HOUR := 17.75
## Sun elevation (degrees) below which the moon casts the shadows instead.
const LIGHT_SWITCH := -4.0
## The light never comes from lower than this, so shadows stay a sensible length.
const MIN_LIGHT_ELEVATION := 4.0

# hour, light colour, intensity, hemi sky, hemi ground, hemi intensity, zenith, horizon, glow,
# glow strength, exposure, environment, night, haze (the Three.js keys, in order).
const NIGHT_KEY: Array = [0x9db2de, 0.45, 0x34466e, 0x1c1a17, 0.55, 0x040a1a, 0x1b2539, 0x000000, 0.0, 1.3, 0.08, 1.0, 1.15]
const KEYS: Array = [
	[0.0, NIGHT_KEY],
	[4.9, NIGHT_KEY],
	# Dawn: the moon fades out just before the sun takes over.
	[5.85, [0xffa77a, 0.15, 0x6a78a0, 0x3a3228, 0.55, 0x1d3360, 0xd39a80, 0xff9a5a, 0.6, 1.15, 0.18, 0.65, 1.25]],
	[6.7, [0xffbf8a, 1.5, 0xbccce6, 0x7d6a50, 0.7, 0x4a80c6, 0xf0cba6, 0xffb070, 1.0, 1.1, 0.35, 0.1, 1.3]],
	[8.5, [0xfff0d8, 2.45, 0xdcecff, 0x8d7b5a, 0.82, 0x3f86d4, 0xcadde8, 0xfff0c8, 0.5, 1.05, 0.45, 0.0, 1.05]],
	[12.5, [0xfff5e4, 2.7, 0xdfefff, 0x8d7b5a, 0.85, 0x3a80d0, 0xc9dbe6, 0xfff4dc, 0.4, 1.0, 0.45, 0.0, 1.0]],
	[15.5, [0xffead0, 2.65, 0xe4ecf6, 0x8f7a58, 0.82, 0x4387d0, 0xd6dcdc, 0xffe4b8, 0.55, 1.04, 0.45, 0.0, 1.05]],
	# Golden hour, the default look: low warm sun, warm haze, cool blue overhead.
	[17.75, [0xffb26a, 2.9, 0xf2d6b8, 0x8a6a48, 0.78, 0x5585c2, 0xf0c592, 0xffa860, 1.1, 1.12, 0.45, 0.0, 1.2]],
	[18.5, [0xff8a4c, 1.3, 0xd4a892, 0x5a4434, 0.65, 0x37589a, 0xee9a6c, 0xff7a3a, 1.3, 1.12, 0.3, 0.3, 1.25]],
	# Dusk: the sun's light fades out just before the moon takes over.
	[19.0, [0xb08a8a, 0.18, 0x6a6a8e, 0x3a3028, 0.55, 0x1a2a55, 0x8e6a72, 0xff6a3a, 0.65, 1.18, 0.15, 0.7, 1.2]],
	[19.8, [0x9db2de, 0.35, 0x3c4c74, 0x221e1a, 0.55, 0x081230, 0x2c3048, 0x803a2a, 0.15, 1.25, 0.1, 0.95, 1.15]],
	[20.6, NIGHT_KEY],
	[24.0, NIGHT_KEY],
]
static var MOON: Vector3 = Vector3(-0.32, 0.8, 0.5).normalized()


static func wrap_hour(hour: float) -> float:
	if is_nan(hour) or is_inf(hour):
		return DEFAULT_HOUR
	return fposmod(hour, 24.0)


## Sun elevation in degrees: about 70° at midday, negative at night.
static func sun_elevation(hour: float) -> float:
	return 70.0 * sin(PI * (wrap_hour(hour) - 6.1) / 12.6)


## Unit vector towards the sun: east in the morning, south at noon, west in the evening.
static func sun_direction(hour: float, elevation_degrees: float) -> Vector3:
	var theta := PI * (wrap_hour(hour) - 6.1) / 12.6
	var flat := Vector2(cos(theta), 0.45 * sin(theta)).normalized()
	var e := deg_to_rad(elevation_degrees)
	return Vector3(flat.x * cos(e), sin(e), flat.y * cos(e))


static func _rgb(hex: int) -> Color:
	return Color8((hex >> 16) & 255, (hex >> 8) & 255, hex & 255)


## A grey of the same brightness, a little darker: what rain does to a sky colour.
static func overcast(c: Color, amount: float) -> Color:
	var luma := 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
	return c.lerp(Color(luma * 0.82, luma * 0.86, luma * 0.92), amount)


## The look at an hour (0 to 24, wraps) and a rain level (0 dry … 1 steady rain).
static func at(hour: float, rain: float = 0.0) -> Look:
	var h := wrap_hour(hour)
	var wet := clampf(rain if not is_nan(rain) else 0.0, 0.0, 1.0)
	var a: Array = KEYS[KEYS.size() - 1][1]
	var b: Array = a
	var t := 0.0
	for i in KEYS.size() - 1:
		var ha: float = KEYS[i][0]
		var hb: float = KEYS[i + 1][0]
		if h >= ha and h <= hb:
			a = KEYS[i][1]
			b = KEYS[i + 1][1]
			var x := (h - ha) / (hb - ha) if hb > ha else 0.0
			t = x * x * (3.0 - 2.0 * x)  # ease between keys
			break
	var look := Look.new()
	look.hour = h
	look.rain = wet
	var elevation := sun_elevation(h)
	look.sun_sky = sun_direction(h, elevation)
	look.light = sun_direction(h, maxf(elevation, MIN_LIGHT_ELEVATION)) if elevation > LIGHT_SWITCH else MOON
	look.moon = MOON
	look.night = lerpf(a[11], b[11], t)
	look.light_color = overcast(_rgb(a[0]).lerp(_rgb(b[0]), t), wet * 0.6)
	look.light_intensity = lerpf(a[1], b[1], t) * (1.0 - 0.7 * wet)
	look.sun_disc = clampf((elevation + 1.0) / 4.0, 0.0, 1.0) * (1.0 - wet)
	look.moonlight = clampf((look.night - 0.5) * 2.0, 0.0, 1.0) * (1.0 - wet)
	look.hemi_sky = overcast(_rgb(a[2]).lerp(_rgb(b[2]), t), wet * 0.7)
	look.hemi_ground = _rgb(a[3]).lerp(_rgb(b[3]), t)
	look.hemi_intensity = lerpf(a[4], b[4], t) * (1.0 + 0.15 * wet)
	look.zenith = overcast(_rgb(a[5]).lerp(_rgb(b[5]), t), wet * 0.8)
	look.horizon = overcast(_rgb(a[6]).lerp(_rgb(b[6]), t), wet * 0.75)
	look.glow = _rgb(a[7]).lerp(_rgb(b[7]), t)
	look.glow_strength = lerpf(a[8], b[8], t) * (1.0 - 0.85 * wet)
	look.exposure = lerpf(a[9], b[9], t) * (1.0 - 0.04 * wet)
	look.environment = lerpf(a[10], b[10], t)
	look.haze = lerpf(a[12], b[12], t) * (1.0 + 0.5 * wet)
	return look
