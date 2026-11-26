class_name RidePoses
extends RefCounted
## The seated pose of a vehicle's driver for the person figures (G-261): the vehicles module's
## ride pose (`VehicleType.pose`, measured on the model) turned into the player module's
## `SeatPose`. The composition root does it because neither module may use the other.


## A new seat pose for `t`'s driver, hip joints `hip_height` above the figure's origin.
static func driver(t: VehicleType, hip_height: float) -> SeatPose:
	var p := t.pose
	var seat := SeatPose.driver(hip_height, p.lean, p.hand, p.foot, p.knees)
	seat.hub = p.hub
	seat.steer_axis = p.steer_axis
	seat.steer_ratio = p.steer_ratio
	return seat
