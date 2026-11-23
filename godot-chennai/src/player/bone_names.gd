class_name BoneNames
extends RefCounted
## Plain bone names (`Hips`, `LeftArm`...) whatever prefix a rig used. MPFB's "mixamo" rig and
## Mixamo clips name bones `mixamorig:Hips`; Godot's glTF importer turns the colon into an
## underscore (`mixamorig_Hips`); some exporters drop it (`mixamorigHips`). Only a prefix
## followed by a capital letter is a prefix (`mixamorigs` stays as it is).

static var _prefix: RegEx = null


static func plain(name: String) -> String:
	if _prefix == null:
		_prefix = RegEx.create_from_string("^mixamorig[:_]?(?=[A-Z])")
	return _prefix.sub(name, "")
