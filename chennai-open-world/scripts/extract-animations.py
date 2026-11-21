"""
One-off asset tool: copies chosen animations (and the skeleton they drive) out of a rigged
.glb into a small animations-only .glb, dropping meshes, skins, materials and textures.

  python3 scripts/extract-animations.py source.glb assets/animations/locomotion.glb idle walk run

Position and scale tracks are dropped, so the clips can drive any character with the same
bone names whatever its size (only joint rotations are kept).
"""
import json
import struct
import sys

source, target, wanted = sys.argv[1], sys.argv[2], sys.argv[3:]
data = open(source, "rb").read()
json_length = struct.unpack("<I", data[12:16])[0]
gltf = json.loads(data[20:20 + json_length])
binary = data[20 + json_length + 8:]

animations = [a for a in gltf["animations"] if a.get("name") in wanted]
missing = set(wanted) - {a["name"] for a in animations}
if missing:
    sys.exit(f"Animations not found: {sorted(missing)}")

new_bin = bytearray()
views, accessors, accessor_map = [], [], {}

def keep(index):
    """Copy one accessor (and its bytes) into the new file; return its new index."""
    if index in accessor_map:
        return accessor_map[index]
    accessor = dict(gltf["accessors"][index])
    view = gltf["bufferViews"][accessor["bufferView"]]
    start = view.get("byteOffset", 0)
    chunk = binary[start:start + view["byteLength"]]
    while len(new_bin) % 4:
        new_bin.append(0)
    new_view = {"buffer": 0, "byteOffset": len(new_bin), "byteLength": len(chunk)}
    if "byteStride" in view:
        new_view["byteStride"] = view["byteStride"]
    new_bin.extend(chunk)
    views.append(new_view)
    accessor["bufferView"] = len(views) - 1
    accessors.append(accessor)
    accessor_map[index] = len(accessors) - 1
    return accessor_map[index]

out_animations = []
for animation in animations:
    samplers, channels = [], []
    for channel in animation["channels"]:
        if channel["target"]["path"] != "rotation":
            continue
        sampler = dict(animation["samplers"][channel["sampler"]])
        sampler["input"] = keep(sampler["input"])
        sampler["output"] = keep(sampler["output"])
        samplers.append(sampler)
        channels.append({"sampler": len(samplers) - 1, "target": channel["target"]})
    out_animations.append({"name": animation["name"], "samplers": samplers, "channels": channels})

nodes = []
for node in gltf["nodes"]:
    node = dict(node)
    node.pop("mesh", None)
    node.pop("skin", None)
    nodes.append(node)

while len(new_bin) % 4:
    new_bin.append(0)
out = {
    "asset": {"version": "2.0", "generator": "chennai-open-world extract-animations"},
    "scene": 0,
    "scenes": gltf["scenes"],
    "nodes": nodes,
    "animations": out_animations,
    "accessors": accessors,
    "bufferViews": views,
    "buffers": [{"byteLength": len(new_bin)}],
}
text = json.dumps(out, separators=(",", ":")).encode()
text += b" " * (-len(text) % 4)
total = 12 + 8 + len(text) + 8 + len(new_bin)
with open(target, "wb") as handle:
    handle.write(struct.pack("<4sII", b"glTF", 2, total))
    handle.write(struct.pack("<I4s", len(text), b"JSON"))
    handle.write(text)
    handle.write(struct.pack("<I4s", len(new_bin), b"BIN\x00"))
    handle.write(new_bin)
print(f"{target}: {[a['name'] for a in out_animations]}, {total / 1024:.0f} KB")
