shader_type spatial;
// Light rain (the Three.js RainView, decision G-87): short streaks in a box that travels with
// the camera, all in one mesh and one draw call. Streaks stay put in the world as the camera
// moves and wrap round the box, so the rain never runs out; all movement is in the vertex shader.
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, skip_vertex_transform, fog_disabled, shadows_disabled;

uniform vec3 origin = vec3(0.0);
uniform float time = 0.0;
uniform vec3 box = vec3(36.0, 22.0, 36.0);
uniform vec2 wind = vec2(1.2, 0.6);
uniform vec3 tint : source_color = vec3(0.77, 0.8, 0.83);
uniform float opacity = 0.0;
uniform float fall = 14.0;
uniform float streak = 0.04;
uniform float width = 0.012;

varying float fade;

void vertex() {
	vec3 velocity = vec3(wind.x, -fall, wind.y);
	vec3 p = VERTEX;
	float y = mod(p.y - time * fall, box.y);
	vec3 world = vec3(
		origin.x + mod(p.x - origin.x, box.x) - box.x * 0.5,
		origin.y - box.y * 0.35 + y,
		origin.z + mod(p.z - origin.z, box.z) - box.z * 0.5);
	float tail = UV.y;
	world -= velocity * tail * streak;
	vec4 view = VIEW_MATRIX * vec4(world, 1.0);
	// Widen the streak sideways on screen: a quad, so it reads on high-density phones.
	view.x += (UV.x - 0.5) * 2.0 * width * max(1.0, -view.z * 0.08);
	VERTEX = view.xyz;
	float edge = length(world.xz - origin.xz) / (box.x * 0.5);
	fade = (1.0 - smoothstep(0.6, 1.0, edge)) * (1.0 - tail * 0.7) * smoothstep(0.5, 2.0, -view.z);
}

void fragment() {
	ALBEDO = tint;
	ALPHA = opacity * fade;
}
