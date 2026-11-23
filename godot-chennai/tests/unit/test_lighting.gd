extends TestCase
## The look by hour and weather (ported from `lighting.test.ts`, G-86).


func _degrees(look: Lighting.Look) -> float:
	return rad_to_deg(asin(look.light.y))


func _warmth(c: Color) -> float:
	return c.r - c.b


func _jump(a: Lighting.Look, b: Lighting.Look) -> float:
	var worst := 0.0
	for key: String in ["light_intensity", "hemi_intensity", "glow_strength", "exposure", "environment", "night", "haze"]:
		worst = maxf(worst, absf(float(a.get(key)) - float(b.get(key))))
	for key: String in ["zenith", "horizon", "hemi_sky", "hemi_ground", "glow"]:
		var ca: Color = a.get(key)
		var cb: Color = b.get(key)
		worst = maxf(worst, maxf(absf(ca.r - cb.r), maxf(absf(ca.g - cb.g), absf(ca.b - cb.b))))
	return worst


func test_golden_hour_is_low_warm_and_hazy_in_the_west() -> bool:
	var look := Lighting.at(17.75)
	assert_true(_degrees(look) > 8.0 and _degrees(look) < 25.0, "low sun (%.1f°)" % _degrees(look))
	assert_true(look.light.x < -0.8, "in the west (-X)")
	assert_true(_warmth(look.light_color) > 0.4, "warm light")
	assert_true(_warmth(look.horizon) > 0.2, "warm haze")
	assert_eq(look.night, 0.0, "day")
	assert_true(look.haze > Lighting.at(12.5).haze, "hazier than noon")
	return true


func test_noon_high_night_dark_with_the_moon() -> bool:
	var noon := Lighting.at(12.5)
	assert_true(_degrees(noon) > 60.0, "high noon sun")
	assert_true(noon.light.z > 0.0, "in the south (+Z)")
	var night := Lighting.at(21.5)
	assert_eq(night.night, 1.0, "night")
	assert_true(night.light_intensity < noon.light_intensity / 4.0, "dim moonlight")
	assert_true(maxf(night.zenith.r, maxf(night.zenith.g, night.zenith.b)) < 0.15, "dark sky")
	assert_eq(night.moonlight, 1.0, "the moon is out")
	assert_eq(night.sun_disc, 0.0, "no sun disc")
	assert_true(Lighting.sun_elevation(21.5) < 0.0, "the sun is down")
	assert_true(Lighting.at(7.0).light.x > 0.8, "the morning sun rises in the east")
	return true


func test_wraps_and_tolerates_bad_input() -> bool:
	assert_eq(Lighting.at(24.0).hour, Lighting.at(0.0).hour, "24 is midnight")
	assert_eq(Lighting.at(24.0).light_intensity, Lighting.at(0.0).light_intensity, "same look")
	assert_near(Lighting.at(-2.0).hour, 22.0, 0.0001, "negative hours wrap")
	assert_near(Lighting.at(NAN).hour, 17.75, 0.0001, "NaN falls back to golden hour")
	return true


func test_changes_smoothly_through_the_day() -> bool:
	var step := 1.0 / 60.0
	var previous := Lighting.at(0.0)
	var hour := step
	while hour <= 24.0:
		var look := Lighting.at(hour)
		check(_jump(previous, look) < 0.06, "no jump at %.2f h" % hour)
		check(absf(look.light.length() - 1.0) < 0.00001 and absf(look.sun_sky.length() - 1.0) < 0.00001, "unit directions at %.2f" % hour)
		check(_degrees(look) >= 3.99, "light never below 4° at %.2f" % hour)
		previous = look
		hour += step
	return true


func test_rain_dims_greys_and_thickens_the_haze() -> bool:
	var dry := Lighting.at(17.75, 0.0)
	var wet := Lighting.at(17.75, 1.0)
	assert_eq(wet.rain, 1.0, "rain")
	assert_true(wet.light_intensity < dry.light_intensity * 0.5, "dimmer sun")
	assert_true(_warmth(wet.horizon) < _warmth(dry.horizon), "greyer horizon")
	assert_true(wet.haze > dry.haze * 1.4, "thicker haze")
	assert_eq(wet.sun_disc, 0.0, "no sun disc")
	assert_eq(Lighting.at(17.75, 5.0).rain, 1.0, "clamped")
	return true
