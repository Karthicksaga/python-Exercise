// The flat layers of a chunk in one draw call (GroundMeshes): floor(UV.x / 1024) picks a tile of
// the ground atlas (asphalt, paving, grass, sand, water, paint, kerb, earth) and UV repeats inside it.
// Explicit gradients keep the mipmap choice smooth across the tile seams made by fract().
// Layers 8 and up are ground covers (G-154): a base tile (grass or sand) tinted per cover, with a
// slow two-octave value noise so parks, meadows and scrub are not one flat colour. The noise
// repeats every PERIOD repeats and GroundMeshes counts repeats from a multiple of PERIOD, so it
// continues across chunk edges.
shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

uniform sampler2D atlas : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform float tiles = 8.0;
// Wet look (rain, owned by Sound/Environment later): darkens and smooths the paved layers.
uniform float wet : hint_range(0.0, 1.0) = 0.0;

// The layer rides in u (GroundMeshes.LAYER_U): vertex colours and UV2 did not reach this shader
// reliably under the Compatibility renderer.
const float LAYER_U = 1024.0;
const float PERIOD = 16.0;
const int COVERS = 12;
// Ground covers (GroundMeshes.COVER_*): base tile, tint, noise strength.
const float COVER_BASE[COVERS] = float[](2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 3.0, 7.0, 1.0, 7.0);
const vec3 COVER_TINT[COVERS] = vec3[](
	vec3(0.84, 0.88, 0.72),  // lawn (parks, gardens): toned down, sun-dried
	vec3(1.12, 1.06, 0.74),  // meadow (dry grass)
	vec3(0.92, 0.86, 0.66),  // scrub
	vec3(0.70, 0.80, 0.68),  // forest floor
	vec3(0.62, 0.74, 0.62),  // mangrove and wetland
	vec3(0.98, 1.10, 0.80),  // farmland (paddy)
	vec3(0.86, 0.96, 0.74),  // sport pitch
	vec3(0.92, 0.94, 0.84),  // cemetery
	vec3(1.00, 0.97, 0.92),  // bare ground and salt pans (sand tile)
	vec3(1.25, 0.62, 0.46),  // running track (clay over the earth tile)
	vec3(0.78, 0.50, 0.44),  // playground and hard courts (rubber over the paving tile)
	vec3(0.70, 0.60, 0.50)   // allotments (tilled soil over the earth tile)
);
const float COVER_NOISE[COVERS] = float[](0.10, 0.18, 0.26, 0.16, 0.18, 0.12, 0.05, 0.12, 0.14, 0.10, 0.06, 0.30);

float hash2(vec2 p) {
	p = mod(p, PERIOD);
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Value noise with a period of PERIOD cells.
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash2(i);
	float b = hash2(i + vec2(1.0, 0.0));
	float c = hash2(i + vec2(0.0, 1.0));
	float d = hash2(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void fragment() {
	float l = floor(UV.x / LAYER_U);
	vec2 uv = vec2(UV.x - l * LAYER_U, UV.y);
	int cover = int(l) - 8;
	float tile = l;
	if (cover >= 0 && cover < COVERS) {
		tile = COVER_BASE[cover];
	} else if (l > 19.5) {
		// Road detail layers 20 and up (CityAtlas.GROUND_ASPHALT_WORN...) live in tiles 8 and up.
		tile = l - 12.0;
	}
	vec2 inner = fract(uv);
	// A few texels in from the tile's edges, so neighbouring tiles never bleed in at a distance.
	float edge = 8.0 / 256.0;
	inner = clamp(inner, edge, 1.0 - edge);
	vec2 coord = vec2((tile + inner.x) / tiles, inner.y);
	// Mip level capped at 3 (8-texel footprint, inside the inset): far away a coarser mip would
	// average neighbouring tiles and draw seams; the haze hides the aliasing instead.
	vec2 gx = dFdx(uv);
	vec2 gy = dFdy(uv);
	float g = max(length(gx), length(gy));
	float cap = min(1.0, (1.0 / 32.0) / max(g, 1e-6));
	vec2 dx = gx * cap / vec2(tiles, 1.0);
	vec2 dy = gy * cap / vec2(tiles, 1.0);
	vec4 c = textureGrad(atlas, coord, dx, dy);
	vec3 rgb = c.rgb;
	if (cover >= 0 && cover < COVERS) {
		// Two octaves: patches of about 4 and 1 repeats (24 m and 6 m at the green scale).
		float n = vnoise(uv / 4.0) * 0.65 + vnoise(uv) * 0.35;
		rgb *= COVER_TINT[cover] * (1.0 + (n - 0.5) * 2.0 * COVER_NOISE[cover]);
	}
	// Road surfaces drift in tone over nine metres or so (wear, dust, old patching): one octave of
	// the continuous noise, only on asphalt, worn asphalt and concrete (road detail, G-311).
	if (l < 0.5 || (l > 19.5 && l < 21.5)) {
		rgb *= 0.88 + 0.24 * vnoise(uv);
	}
	float paved = (l < 1.5 || l > 19.5) ? 1.0 : 0.0;
	ALBEDO = rgb * (1.0 - 0.35 * wet * paved);
	// Water is smooth, asphalt and stone rough.
	ROUGHNESS = (l > 3.5 && l < 4.5) ? 0.2 : mix(0.95, 0.35, wet * paved);
	// Muddy puddles (road condition, G-315): shiny, shinier still after rain, no reflection pass.
	if (l > 29.5 && l < 30.5) {
		ROUGHNESS = mix(0.3, 0.05, wet);
		rgb *= 1.0 - 0.25 * wet;
		ALBEDO = rgb;
	}
	SPECULAR = 0.3;
}
