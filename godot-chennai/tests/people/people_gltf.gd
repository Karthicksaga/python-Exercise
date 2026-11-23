## Loading helpers shared by the people tests and the review renders. Reads the GLBs with
## GLTFDocument at run time (the same parser the importer uses, including the bone renaming
## `mixamorig:X` -> `mixamorig_X`), so the tests need no import step and run in any project
## whose res:// holds `assets/people/`.
extends RefCounted

const MANIFEST := "res://assets/people/people.json"


static func read_manifest() -> Array:
	var text := FileAccess.get_file_as_string(MANIFEST)
	var data: Variant = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY or not (data as Dictionary).has("people"):
		push_error("people.json missing or unreadable")
		return []
	return (data as Dictionary)["people"]


static func glb_path(entry: Dictionary) -> String:
	return "res://assets/people/" + String(entry["file"])


static func load_person(entry: Dictionary) -> Node3D:
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var err := doc.append_from_file(ProjectSettings.globalize_path(glb_path(entry)), state)
	if err != OK:
		return null
	var scene := doc.generate_scene(state) as Node3D
	return scene


static func find_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := find_player(child)
		if found:
			return found
	return null


static func find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child in node.get_children():
		var found := find_skeleton(child)
		if found:
			return found
	return null


static func find_mesh(node: Node, mesh_name: String) -> MeshInstance3D:
	if node is MeshInstance3D and node.name == mesh_name:
		return node
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
