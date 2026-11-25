class_name RoadLamps
extends RefCounted
## Where each lamp kind's light is (G-316), as the night glow needs it: for a pole, the lamp heads as
## (x, height, z) world points and a tint. Plain data. The sizes mirror `RoadModels` (arm lengths and
## the height of each head above the ground).

const COOL := Color(0.78, 0.88, 1.0)
const WARM := Color(1.0, 0.9, 0.72)
## Head height and reach (metres from the pole towards the road, or along the cross arms).
const ARM := Vector2(8.95, 2.5)
const RURAL := Vector2(7.5, 1.2)
const TWIN := Vector2(9.95, 2.2)
const MAST := 24.6


static func tint_of(pole: StreetFurniture.Pole) -> Color:
	return WARM if pole.warm else COOL


## Lamp head points of one pole: (x, height, z).
static func heads(pole: StreetFurniture.Pole) -> PackedVector3Array:
	var out := PackedVector3Array()
	var towards := Vector2(-sin(pole.yaw), -cos(pole.yaw))
	var across := Vector2(cos(pole.yaw), -sin(pole.yaw))
	match pole.kind:
		&"mast":
			out.append(Vector3(pole.position.x, MAST, pole.position.y))
		&"twin":
			for sgn: float in [-1.0, 1.0]:
				var p := pole.position + across * sgn * TWIN.y
				out.append(Vector3(p.x, TWIN.x, p.y))
		&"rural":
			var r := pole.position + towards * RURAL.y
			out.append(Vector3(r.x, RURAL.x, r.y))
		_:
			var a := pole.position + towards * ARM.y
			out.append(Vector3(a.x, ARM.x, a.y))
	return out
