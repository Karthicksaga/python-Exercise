class_name WeaponModels
extends RefCounted
## Low-poly weapons in a figure's right hand (port of `packages/player/src/weaponModels.ts`,
## decision G-433): the cricket bat, a stick and a bottle for fights, and the pistol, pump
## shotgun and compact SMG the Three.js game also had. Each is a few boxes or prisms built by
## script into one mesh coloured from the shared palette texture (`LowPoly`), so a held weapon
## is one draw call, every figure shares the same meshes and the one material, and there is
## nothing to download. A single-box silhouette takes over beyond `LOD_DISTANCE` metres.
##
## Mesh space: the grip is at the origin, the barrel or blade along +Z, up is +Y; sizes are
## estimates of the real objects, metres. `attach` mounts it on the right hand bone (a
## `BoneAttachment3D`) turned to the hand's own axes: a club lies across the palm with its blade
## beyond the thumb side, a gun's barrel runs along the fingers with the sights towards the thumb.
## Only the right hand holds (as in the Three.js game).

const IDS: Array[StringName] = [&"bat", &"stick", &"bottle", &"pistol", &"shotgun", &"smg"]
const GUNS: Array[StringName] = [&"pistol", &"shotgun", &"smg"]
## Beyond this distance (metres) the one-box silhouette is drawn.
const LOD_DISTANCE := 25.0
## Name of the attachment node under the skeleton.
const NODE_NAME := "HeldWeapon"

static var _near: Dictionary[StringName, ArrayMesh] = {}
static var _far: Dictionary[StringName, ArrayMesh] = {}
static var _extent: Dictionary[StringName, Vector3] = {}


static func is_weapon(id: StringName) -> bool:
	return IDS.has(id)


static func is_gun(id: StringName) -> bool:
	return GUNS.has(id)


## The full mesh of a weapon (built once, shared).
static func mesh(id: StringName) -> ArrayMesh:
	if not _near.has(id):
		_build(id)
	return _near[id]


## Triangles in a held weapon's near mesh (for the draw-cost budget).
static func triangles(id: StringName) -> int:
	var m := mesh(id)
	var idx := m.surface_get_arrays(0)[Mesh.ARRAY_INDEX] as PackedInt32Array
	return idx.size() / 3


static func _build(id: StringName) -> void:
	var b := LowPoly.Builder.new()
	match id:
		&"bat":
			# A taped handle, the shoulder, then the flat willow blade with its raised spine.
			b.add_box(0.034, 0.034, 0.30, 0, 0, 0.08, LowPoly.TAPE_RED)
			b.add_box(0.034, 0.034, 0.05, 0, 0, -0.095, LowPoly.DARK)
			b.add_box(0.064, 0.038, 0.12, 0, 0, 0.27, LowPoly.WILLOW)
			b.add_box(0.108, 0.036, 0.50, 0, 0, 0.58, LowPoly.WILLOW)
			b.add_box(0.050, 0.060, 0.38, 0, -0.012, 0.56, LowPoly.WOOD)
		&"stick":
			# A plain wooden staff with a darker grip wrap.
			b.add_prism(0.016, 0.014, -0.10, 0.90, 0, 0, 6, LowPoly.STICK)
			b.add_prism(0.019, 0.019, -0.08, 0.14, 0, 0, 6, LowPoly.DARK_WOOD)
		&"bottle":
			# A green glass bottle held by the neck: cap, neck, shoulder, body, a paper label.
			b.add_prism(0.014, 0.014, -0.09, -0.07, 0, 0, 6, LowPoly.STEEL)
			b.add_prism(0.011, 0.011, -0.07, 0.04, 0, 0, 6, LowPoly.GLASS)
			b.add_prism(0.011, 0.035, 0.04, 0.09, 0, 0, 8, LowPoly.GLASS)
			b.add_prism(0.035, 0.035, 0.09, 0.30, 0, 0, 8, LowPoly.GLASS)
			b.add_prism(0.0365, 0.0365, 0.15, 0.23, 0, 0, 8, LowPoly.PAPER)
		&"pistol":
			b.add_box(0.034, 0.045, 0.19, 0, 0.045, 0.06, LowPoly.METAL)
			b.add_box(0.03, 0.10, 0.045, 0, -0.005, 0.0, LowPoly.DARK)
		&"shotgun":
			b.add_box(0.03, 0.03, 0.62, 0, 0.055, 0.30, LowPoly.METAL)
			b.add_box(0.026, 0.024, 0.48, 0, 0.022, 0.26, LowPoly.DARK)
			b.add_box(0.045, 0.045, 0.16, 0, 0.022, 0.38, LowPoly.WOOD)
			b.add_box(0.045, 0.07, 0.14, 0, 0.03, 0.02, LowPoly.METAL)
			b.add_box(0.04, 0.09, 0.30, 0, -0.005, -0.17, LowPoly.WOOD)
		&"smg":
			b.add_box(0.045, 0.07, 0.26, 0, 0.05, 0.08, LowPoly.METAL)
			b.add_box(0.02, 0.02, 0.09, 0, 0.065, 0.25, LowPoly.DARK)
			b.add_box(0.03, 0.15, 0.04, 0, -0.04, 0.0, LowPoly.DARK)
		_:
			b.add_box(0.03, 0.1, 0.2, 0, 0, 0.05, LowPoly.DARK)
	_near[id] = b.build()
	var box := _near[id].get_aabb()
	_extent[id] = box.size
	var far := LowPoly.Builder.new()
	far.add_box(maxf(0.03, box.size.x), maxf(0.03, box.size.y), box.size.z, box.get_center().x, box.get_center().y, box.get_center().z, LowPoly.DARK)
	_far[id] = far.build()


## The weapon held now, &"" when none.
static func held(figure: CombatFigure) -> StringName:
	return figure.held_id if figure.held_node != null else &""


## Puts `weapon_id` in the figure's right hand, replacing what it held. Unknown ids (&"fists")
## leave the hand empty.
static func attach(figure: CombatFigure, weapon_id: StringName) -> void:
	detach(figure)
	if not is_weapon(weapon_id) or figure.poser == null:
		return
	var r := figure.poser
	var near := mesh(weapon_id)
	var att := BoneAttachment3D.new()
	att.name = NODE_NAME
	att.bone_name = r.skeleton.get_bone_name(r.index[PoseRig.HAND[1]])
	r.skeleton.add_child(att)
	var grip := Node3D.new()
	grip.name = "Grip"
	grip.transform = grip_transform(r, weapon_id)
	att.add_child(grip)
	var near_view := MeshInstance3D.new()
	near_view.name = "Near"
	near_view.mesh = near
	near_view.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	near_view.visibility_range_end = LOD_DISTANCE
	grip.add_child(near_view)
	var far_view := MeshInstance3D.new()
	far_view.name = "Far"
	far_view.mesh = _far[weapon_id]
	far_view.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	far_view.visibility_range_begin = LOD_DISTANCE
	grip.add_child(far_view)
	figure.held_id = weapon_id
	figure.held_node = att


## Takes the weapon out of the hand.
static func detach(figure: CombatFigure) -> void:
	if figure.held_node != null:
		if is_instance_valid(figure.held_node):
			var parent := figure.held_node.get_parent()
			if parent != null:
				parent.remove_child(figure.held_node)
			figure.held_node.queue_free()
		figure.held_node = null
	figure.held_id = &""


## The weapon's place in the hand bone's own frame (skeleton units): a club's axis along the
## thumb side with its flat back to the back of the hand, a gun's barrel along the fingers.
static func grip_transform(r: PoseRig, id: StringName) -> Transform3D:
	var ax := HandReach.axes(r, 1)
	var finger := ax[0]
	var thumb := ax[1]
	var palm := ax[2]
	var z: Vector3
	var y: Vector3
	if is_gun(id):
		z = finger
		y = thumb
	else:
		z = thumb
		y = -palm
	y = (y - z * y.dot(z)).normalized()
	var x := y.cross(z).normalized()
	# The mesh is in metres, the skeleton may not be.
	var s := maxf(0.0001, r.to_fig.basis.get_scale().x)
	var basis := Basis(x, y, z).scaled(Vector3.ONE / s)
	return Transform3D(basis, ax[3] + palm * (0.012 / s))
