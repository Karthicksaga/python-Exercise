class_name TreeKit
extends RefCounted
## The committed tree kit (G-381, G-382): one `ArrayMesh` per species and LOD on the shared
## `trees.gdshader` material, and the triangle counts a chunk's statistics use. Models are built on
## a worker (`TreeModels.create`); `commit` makes the meshes on the main thread (like the other
## chunk models), where the material was made.

const SHADER := preload("res://src/game_engine/trees/trees.gdshader")

var models: TreeModels
var material: ShaderMaterial
## species -> [ArrayMesh x 3]
var meshes: Dictionary[StringName, Array] = {}
## species -> PackedInt32Array(3) triangles per LOD.
var triangles: Dictionary[StringName, PackedInt32Array] = {}


## The shared material: the atlas texture (a white stand-in until the PNG exists).
static func make_material() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = SHADER
	var tex: Texture2D = null
	if ResourceLoader.exists(TreeAtlas.PNG):
		tex = load(TreeAtlas.PNG) as Texture2D
	if tex == null:
		var img := Image.create(8, 8, false, Image.FORMAT_RGBA8)
		img.fill(Color(0.3, 0.6, 0.25, 1.0))
		tex = ImageTexture.create_from_image(img)
	m.set_shader_parameter(&"atlas", tex)
	return m


static func build_models() -> TreeModels:
	return TreeModels.create(TreeAtlas.load_layout())


static func commit(built: TreeModels, mat: ShaderMaterial) -> TreeKit:
	var k := TreeKit.new()
	k.models = built
	k.material = mat
	for id in TreeSpecies.IDS:
		var list: Array[ArrayMesh] = []
		var tris := PackedInt32Array([0, 0, 0])
		for lod in TreeSpecies.LODS:
			var b := built.builder(id, lod)
			list.append(b.commit(mat))
			tris[lod] = b.triangle_count()
		k.meshes[id] = list
		k.triangles[id] = tris
	return k


func mesh_of(species: StringName, lod: int) -> ArrayMesh:
	return (meshes[species] as Array)[lod] as ArrayMesh
