class_name FurnitureMesh
extends RefCounted
## All the furniture of a room merged into two meshes, solid and glow (G-236): two draw calls
## however many pieces there are. Rebuilt in a moment whenever the layout changes. Floor pieces
## stand centred on their footprint turned `-r` quarter turns; ceiling pieces hang 0.2 m under the
## ceiling; wall pieces sit on their wall at 1.7 m (the back wall faces +z, the left wall +x).

const WALL_HEIGHT := 1.7
const CEILING_DROP := 0.2

var solid: MeshBuilder = MeshBuilder.new()
var glow: MeshBuilder = MeshBuilder.new()
var triangles: int = 0
var _cache: Dictionary[String, Dictionary] = {}


## The placement of a piece in room coordinates.
static func transform_of(def: PropDef, it: PlacedProp) -> Transform3D:
	match def.kind:
		PropDef.CEILING:
			return Transform3D(Basis.IDENTITY, Vector3(float(it.x) + 0.5, HomeRoom.HEIGHT - CEILING_DROP, float(it.z) + 0.5))
		PropDef.WALL:
			if it.wall == "b":
				return Transform3D(Basis.IDENTITY, Vector3(float(it.x) + float(def.w) * 0.5, WALL_HEIGHT, 0.08))
			return Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(0.08, WALL_HEIGHT, float(it.z) + float(def.w) * 0.5))
		_:
			var size := def.size_at(it.r)
			return Transform3D(Basis(Vector3.UP, -float(it.r) * PI * 0.5), Vector3(float(it.x) + float(size.x) * 0.5, 0.0, float(it.z) + float(size.y) * 0.5))


func build(items: Array[PlacedProp], props: PropCatalog) -> void:
	solid = MeshBuilder.new()
	glow = MeshBuilder.new()
	for it in items:
		var def := props.get_prop(it.k)
		if def == null:
			continue
		if not _cache.has(def.id):
			_cache[def.id] = PropMesh.build(def)
		var parts: Dictionary = _cache[def.id]
		var xf := transform_of(def, it)
		solid.append(parts["solid"] as MeshBuilder, xf)
		glow.append(parts["glow"] as MeshBuilder, xf)
	triangles = solid.triangle_count() + glow.triangle_count()


## The two meshes with their materials (either may be null when empty).
func meshes(solid_material: Material, glow_material: Material) -> Array[ArrayMesh]:
	return [solid.commit(solid_material), glow.commit(glow_material)]
