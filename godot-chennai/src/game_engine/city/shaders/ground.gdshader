// The flat layers of a chunk in one draw call (GroundMeshes): floor(UV.x / 1024) picks a tile of
// the ground atlas (asphalt, paving, grass, sand, water, paint, kerb, earth) and UV repeats inside it.
// Explicit gradients keep the mipmap choice smooth across the tile seams made by fract().
shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

uniform sampler2D atlas : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform float tiles = 8.0;
// Wet look (rain, owned by Sound/Environment later): darkens and smooths the paved layers.
uniform float wet : hint_range(0.0, 1.0) = 0.0;

// The layer rides in u (GroundMeshes.LAYER_U): vertex colours and UV2 did not reach this shader
// reliably under the Compatibility renderer.
const float LAYER_U = 1024.0;

void fragment() {
	float l = floor(UV.x / LAYER_U);
	vec2 uv = vec2(UV.x - l * LAYER_U, UV.y);
	vec2 inner = fract(uv);
	// A few texels in from the tile's edges, so neighbouring tiles never bleed in at a distance.
	float edge = 8.0 / 256.0;
	inner = clamp(inner, edge, 1.0 - edge);
	vec2 coord = vec2((l + inner.x) / tiles, inner.y);
	// Mip level capped at 3 (8-texel footprint, inside the inset): far away a coarser mip would
	// average neighbouring tiles and draw seams; the haze hides the aliasing instead.
	vec2 gx = dFdx(uv);
	vec2 gy = dFdy(uv);
	float g = max(length(gx), length(gy));
	float cap = min(1.0, (1.0 / 32.0) / max(g, 1e-6));
	vec2 dx = gx * cap / vec2(tiles, 1.0);
	vec2 dy = gy * cap / vec2(tiles, 1.0);
	vec4 c = textureGrad(atlas, coord, dx, dy);
	float paved = (l < 1.5) ? 1.0 : 0.0;
	ALBEDO = c.rgb * (1.0 - 0.35 * wet * paved);
	// Water is smooth, asphalt and stone rough.
	ROUGHNESS = (l > 3.5 && l < 4.5) ? 0.2 : mix(0.95, 0.35, wet * paved);
	SPECULAR = 0.3;
}
