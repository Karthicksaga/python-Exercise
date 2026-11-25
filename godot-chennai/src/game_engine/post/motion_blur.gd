class_name MotionBlur
extends Node
## Speed blur for fast driving (port of `packages/game-engine/src/MotionBlur.ts` and the
## `SceneRenderer` rules, decision G-435). The Three.js version blended each frame with the
## previous one through three full-resolution half-float render targets: two extra full-screen
## passes and about 3 x 8 bytes a pixel, which a phone's tile GPU pays dearly for. Here the same
## idea (nothing below 16 m/s, full smear from 32 m/s, the eased strength rising and falling at 4
## per second, never above 0.42 of the effect) is one full-screen pass of a five-tap radial blur
## drawn from the screen's own texture: no history buffer, no render targets.
##
## **Off by default and off on Low and Medium** (`QualitySettings` key `motion_blur`: only High
## may have it, and then only if `wanted` is set, which nothing sets by default). While off the
## node holds nothing: no canvas layer, no shader, no processing; `update` returns at once. The
## layer and shader are made the first time it is actually turned on.

const BLUR_FROM := 16.0
const BLUR_FULL := 32.0
const BLUR_MAX := 0.42
## How fast the strength follows the speed, per second.
const FOLLOW := 4.0
## Below this strength nothing is drawn.
const MIN_DRAWN := 0.02
## Screen share the farthest edge smears over at full strength (radial blur).
const SMEAR := 0.16
const LAYER := 90

const SHADER_CODE := """shader_type canvas_item;
uniform sampler2D screen : hint_screen_texture, filter_linear, repeat_disable;
uniform float amount = 0.0;
void fragment() {
	vec2 d = (vec2(0.5) - SCREEN_UV) * amount;
	vec4 c = textureLod(screen, SCREEN_UV, 0.0);
	c += textureLod(screen, SCREEN_UV + d * 0.25, 0.0);
	c += textureLod(screen, SCREEN_UV + d * 0.5, 0.0);
	c += textureLod(screen, SCREEN_UV + d * 0.75, 0.0);
	c += textureLod(screen, SCREEN_UV + d, 0.0);
	COLOR = vec4((c / 5.0).rgb, 1.0);
}
"""

## The device level lets it exist (High only); `wanted` is the player's choice (default off).
var allowed: bool = false
var wanted: bool = false
## Current strength, 0..BLUR_MAX (eased).
var amount: float = 0.0
## Frames on which the blur was drawn (tests: zero while off).
var drawn_frames: int = 0
var _layer: CanvasLayer = null
var _rect: ColorRect = null
var _material: ShaderMaterial = null


func _init() -> void:
	name = "MotionBlur"
	set_process(false)


## The preset's values (`QualitySettings.values`) decide whether it may run at all.
func configure(values: Dictionary, want: bool) -> void:
	allowed = bool(values.get("motion_blur", false))
	wanted = want
	_apply()


func is_on() -> bool:
	return allowed and wanted


## True while a layer exists and is shown (tests: false whenever off).
func is_drawing() -> bool:
	return _layer != null and _layer.visible


func _apply() -> void:
	if is_on():
		if _layer == null:
			_make_layer()
		return
	amount = 0.0
	if _layer != null:
		_layer.queue_free()
		_layer = null
		_rect = null
		_material = null


func _make_layer() -> void:
	_layer = CanvasLayer.new()
	_layer.name = "MotionBlurLayer"
	_layer.layer = LAYER
	_layer.visible = false
	var shader := Shader.new()
	shader.code = SHADER_CODE
	_material = ShaderMaterial.new()
	_material.shader = shader
	_rect = ColorRect.new()
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rect.material = _material
	_layer.add_child(_rect)
	add_child(_layer)


## The target strength for a speed (m/s): 0 below BLUR_FROM, BLUR_MAX from BLUR_FULL.
static func target_for(speed: float) -> float:
	return clampf((absf(speed) - BLUR_FROM) / (BLUR_FULL - BLUR_FROM), 0.0, 1.0) * BLUR_MAX


## Once a frame with the player's speed (m/s) and the frame's time. Free while off.
func update(speed: float, dt: float) -> void:
	if not is_on() or _layer == null:
		return
	amount += (target_for(speed) - amount) * minf(1.0, dt * FOLLOW)
	var show := amount > MIN_DRAWN
	if show != _layer.visible:
		_layer.visible = show
	if show:
		_material.set_shader_parameter(&"amount", amount / BLUR_MAX * SMEAR)
		drawn_frames += 1
