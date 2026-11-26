// The tree kit's one material (G-382): alpha-cut leaf cards on the shared atlas, wind in the
// vertex stage, per-instance tint from the MultiMesh colour.
//
// UV.x carries the wind weight beside the atlas u: UV.x = u + 2 * level, level 0..8 (the same
// trick as the ground shader's layer, because vertex colours and UV2 did not reach shaders
// reliably under the Compatibility renderer). A level of 0 never moves (trunks, the ground).
// Wind: a slow sway of the whole crown plus a quick small flutter, both growing with the level
// squared and the tree's own scale, phase from the instance's position. `sway` 0 (the Low
// preset, or a calm switch) skips all of it.
shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

uniform sampler2D atlas : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
// Wind: 0 off (Low), 1 the normal sway.
uniform float sway : hint_range(0.0, 2.0) = 1.0;
uniform float wind_speed = 1.5;
// Wet look (rain): the leaves darken a little.
uniform float wet : hint_range(0.0, 1.0) = 0.0;
// 0 by day, 1 at night: a touch darker leaves so the crowns do not glow against the dark ground.
uniform float night : hint_range(0.0, 1.0) = 0.0;

varying vec3 leaf_normal;

void vertex() {
	float level = floor(UV.x * 0.5);
	UV.x = UV.x - 2.0 * level;
	float weight = level * 0.125;
	if (sway > 0.0 && weight > 0.0) {
		vec3 origin = MODEL_MATRIX[3].xyz;
		float phase = origin.x * 0.37 + origin.z * 0.29;
		float t = TIME * wind_speed + phase;
		float gust = sin(t) + 0.45 * sin(t * 2.31 + 1.7);
		float w2 = weight * weight;
		float amp = sway * w2 * 0.14;
		VERTEX.x += gust * amp;
		VERTEX.z += cos(t * 0.83 + 0.6) * amp * 0.6;
		float flutter = sin(TIME * 2.2 + VERTEX.x * 1.2 + VERTEX.y * 1.0 + phase) * 0.004 * sway * weight;
		VERTEX += NORMAL * flutter;
	}
	leaf_normal = normalize(MODELVIEW_NORMAL_MATRIX * NORMAL);
}

void fragment() {
	vec4 tex = texture(atlas, UV);
	ALPHA = tex.a;
	ALPHA_SCISSOR_THRESHOLD = 0.38;
	float shade = 1.0 - 0.14 * wet - 0.25 * night;
	ALBEDO = tex.rgb * COLOR.rgb * shade;
	ROUGHNESS = 1.0;
	// Both faces of a card shade the same: the normal is the crown's (leaf_normal), never flipped.
	NORMAL = normalize(leaf_normal);
}
