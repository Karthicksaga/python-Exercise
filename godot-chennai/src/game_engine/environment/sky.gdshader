shader_type sky;
// The city sky (decision G-86): a gradient from the horizon haze to the zenith, a warm glow round
// the sun and along the horizon below it, the sun and moon discs. Colours come from `Lighting`.
// Cheap on phones: a few ALU ops per pixel, no textures, no radiance (reflections are off).

uniform vec3 zenith : source_color = vec3(0.23, 0.5, 0.82);
uniform vec3 horizon : source_color = vec3(0.79, 0.86, 0.9);
uniform vec3 ground : source_color = vec3(0.55, 0.48, 0.38);
uniform vec3 glow : source_color = vec3(1.0, 0.95, 0.85);
uniform float glow_strength = 0.4;
uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);
uniform float sun_disc = 1.0;
uniform vec3 moon_dir = vec3(-0.32, 0.8, 0.5);
uniform float moonlight = 0.0;

void sky() {
	vec3 d = normalize(EYEDIR);
	float up = clamp(d.y, 0.0, 1.0);
	vec3 col = mix(horizon, zenith, pow(up, 0.55));
	// Below the horizon the haze thickens towards the ground colour (fog hides the rest).
	col = mix(col, mix(horizon, ground, 0.35), clamp(-d.y * 6.0, 0.0, 1.0));
	float s = max(dot(d, normalize(sun_dir)), 0.0);
	float low = pow(1.0 - up, 5.0);
	col += glow * glow_strength * (0.45 * pow(s, 12.0) + 0.35 * low * pow(s, 2.0));
	col += vec3(1.0, 0.96, 0.88) * sun_disc * 6.0 * smoothstep(0.99955, 0.99975, s);
	float m = max(dot(d, normalize(moon_dir)), 0.0);
	col += vec3(0.85, 0.88, 0.95) * moonlight * 1.5 * smoothstep(0.99965, 0.99985, m);
	COLOR = col;
}
