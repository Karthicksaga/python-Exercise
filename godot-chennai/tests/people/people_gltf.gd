## Loading helpers shared by the people tests and the review renders (decision G-16).
## In the project the GLBs are imported scenes (`load()`, which is what the game uses: bone
## names `mixamorig_X`, clip loop modes from the `.import` files). Without an import (a
## throwaway project) it falls back to parsing the file with GLTFDocument.
extends RefCounted

const MANIFEST := "res://assets/people/people.json"


static func read_manifest() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST))
	if not data is Dictionary or not (data as Dictionary).has("people"):
		push_error("people.json missing or unreadable")
		return out
	for entry: Variant in (data as Dictionary)["people"] as Array:
		out.append(entry as Dictionary)
	return out


static func glb_path(entry: Dictionary) -> String:
	return "res://assets/people/" + String(entry["file"])


static func load_person(entry: Dictionary) -> Node3D:
	var path := glb_path(entry)
	if ResourceLoader.exists(path, "PackedScene"):
		var packed := load(path) as PackedScene
		if packed:
			return packed.instantiate() as Node3D
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	if doc.append_from_file(ProjectSettings.globalize_path(path), state) != OK:
		return null
	return doc.generate_scene(state) as Node3D


static func find_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child in node.get_children():
		var found := find_player(child)
		if found:
			return found
	return null


static func find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node as Skeleton3D
	for child in node.get_children():
		var found := find_skeleton(child)
		if found:
			return found
	return null


static func find_mesh(node: Node, mesh_name: String) -> MeshInstance3D:
	if node is MeshInstance3D and node.name == mesh_name:
		return node as MeshInstance3D
	for child in node.get_children():
		var found := find_mesh(child, mesh_name)
		if found:
			return found
	return null


static func show_lod(scene: Node, lod: int) -> void:
	var near := find_mesh(scene, "Body")
	var far := find_mesh(scene, "Body_LOD1")
	if near:
		near.visible = lod == 0
	if far:
		far.visible = lod == 1
