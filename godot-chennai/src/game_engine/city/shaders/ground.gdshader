// The flat layers of a chunk in one draw call (GroundMeshes): UV2.x picks a tile of the ground
// atlas (asphalt, paving, grass, sand, water, paint, kerb, earth) and UV repeats inside it.
// Explicit gradients keep the mipmap choice smooth across the tile seams made by fract().
shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

uniform sampler2D atlas : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform float tiles = 8.0;
// Wet look (rain, owned by Sound/Environment later): darkens and smooths the paved layers.
uniform float wet : hint_range(0.0, 1.0) = 0.0;

varying float layer;

void vertex() {
	layer = UV2.x;
}

void fragment() {
	float l = floor(layer + 0.5);
	vec2 inner = fract(UV);
	// Half a texel in from the tile's edges, so neighbouring tiles never bleed in.
	float edge = 1.0 / 256.0;
	inner = clamp(inner, edge, 1.0 - edge);
	vec2 coord = vec2((l + inner.x) / tiles, inner.y);
	vec2 dx = dFdx(UV) / vec2(tiles, 1.0);
	vec2 dy = dFdy(UV) / vec2(tiles, 1.0);
	vec4 c = textureGrad(atlas, coord, dx, dy);
	float paved = (l < 1.5) ? 1.0 : 0.0;
	ALBEDO = c.rgb * (1.0 - 0.35 * wet * paved);
	// Water is smooth, asphalt and stone rough.
	ROUGHNESS = (l > 3.5 && l < 4.5) ? 0.2 : mix(0.95, 0.35, wet * paved);
	SPECULAR = 0.3;
}
