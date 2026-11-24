// Rivers, canals, ponds and lakes (WaterMeshes, G-152): cheap enough for the Mobile and
// Compatibility renderers. A flat colour from shore to open water (vertex alpha: 1 at the bank),
// a little moving ripple in the normal and the colour, no reflections or refraction.
// UV is world metres / 8 counted from a multiple of 32, so the ripples continue across chunk
// edges (every frequency below repeats over 32 units).
shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec4 open_water : source_color = vec4(0.20, 0.33, 0.33, 1.0);
uniform vec4 shore_water : source_color = vec4(0.40, 0.42, 0.33, 1.0);
uniform float ripple = 0.10;
// Wet look in the rain: rain rings are not drawn, the surface just darkens a little.
uniform float wet : hint_range(0.0, 1.0) = 0.0;

const float W = 6.28318530718 / 32.0;

void fragment() {
	vec2 p = UV;
	float t = TIME;
	float a = sin(p.x * W * 5.0 + t * 0.9) * sin(p.y * W * 4.0 - t * 0.7);
	float b = sin((p.x + p.y) * W * 11.0 + t * 1.6) * 0.5;
	float n = a + b;
	float shore = clamp(COLOR.a, 0.0, 1.0);
	vec3 rgb = mix(open_water.rgb, shore_water.rgb, shore * shore);
	ALBEDO = rgb * (1.0 + n * 0.035) * (1.0 - 0.12 * wet);
	vec3 bend = vec3(cos(p.x * W * 5.0 + t * 0.9), 0.0, cos(p.y * W * 4.0 - t * 0.7)) * ripple;
	NORMAL = normalize(NORMAL + (VIEW_MATRIX * vec4(bend, 0.0)).xyz);
	ROUGHNESS = 0.12;
	SPECULAR = 0.55;
}
