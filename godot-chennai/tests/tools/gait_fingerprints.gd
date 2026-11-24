extends SceneTree
## Prints the gait fingerprints (tests/support/gait_fingerprint.gd) of GLB files and their
## distances to the first file's, for choosing references and thresholds (decision G-101):
##     godot --headless --audio-driver Dummy --path . --script res://tests/tools/gait_fingerprints.gd -- a.glb b.glb ...

const GaitFingerprint := preload("res://tests/support/gait_fingerprint.gd")
const CLIPS: PackedStringArray = ["idle", "walk", "run"]


func _init() -> void:
	var all: Array[Dictionary] = []
	for path in OS.get_cmdline_user_args():
		var doc := GLTFDocument.new()
		var state := GLTFState.new()
		if doc.append_from_file(path, state) != OK:
			push_error("cannot read %s" % path)
			continue
		var scene := doc.generate_scene(state) as Node3D
		var prints := GaitFingerprint.of_scene(scene, CLIPS)
		all.append(prints)
		var line := PackedStringArray()
		for n in CLIPS:
			if prints.has(n):
				var first: Dictionary = all[0]
				var d := GaitFingerprint.distance(prints[n], first[n] as PackedFloat32Array) if first.has(n) else -1.0
				line.append("%s %.1f" % [n, d])
		print("%s: %s" % [path.get_file(), ", ".join(line)])
		if OS.get_environment("PRINT_FP") == "1":
			for n in CLIPS:
				if prints.has(n):
					var v := PackedStringArray()
					for x in prints[n]:
						v.append("%.1f" % x)
					print("  \"%s\": [%s]," % [n, ", ".join(v)])
		scene.free()
	quit(0)
