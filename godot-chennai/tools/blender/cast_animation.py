"""
Animations for the Chennai cast, baked per person onto MPFB's `mixamo` skeleton in Blender.

Five looping clips, the same names in every file: idle, walk, run, sit, talk.

- idle, walk, run: retargeted from Quaternius' Universal Animation Library (Standard, CC0 1.0;
  decision G-100): `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop` of its Godot GLB, a Rigify rig whose
  `DEF-*` bones are renamed to our names (`UAL_BONES`) and whose rest rotations are divided out.
  The GLB is read directly here (no Blender import: its bones are plain nodes), converted to
  Blender axes (glTF +Y up, +Z forward -> Blender +Z up, -Y forward).
- sit, talk: authored here by script (original work, CC0): sit from the retargeted idle pose
  with thighs forward, shins down and hands on the thighs; talk is the idle with hand gestures
  and small head nods laid over it.

Retargeting (lessons from the Three.js game, MIGRATION_PROMPT.md section 7):
- Spine, head and legs rest alike in both rigs: the source's world-space rotation away from its
  rest is applied to the target's own rest frame.
- The MPFB rig rests in an A-pose, the clips in their own rest. For every arm, hand and finger bone the
  target's rest frame is first turned onto the source's rest frame with a FULL frame alignment (bone direction plus a
  second axis: the palm's index-to-pinky line for hands and fingers, the body's sideways axis for
  spine, legs and feet, forward for arms), so hands and finger joints keep their twist and the
  wrists do not bend ~70 degrees.
- Upper arms are then turned ~9 degrees in towards the body (the clips hold them out).
- Soles are planted per frame: the hips are lowered/raised so the lowest sole vertex of the
  actual mesh (shoes and sandals included, skinned with its real weights) stays at height 0.
"""
import json
import math
import struct

import numpy as np
from mathutils import Matrix, Quaternion, Vector

FPS = 30
CLIPS = ("idle", "walk", "run", "sit", "talk")
ARM_IN_DEG = 9.0
# The 9 degrees of the lesson, a little more while standing (the idle's arms hung wide).
ARM_IN_BY_CLIP = {"idle": 11.0, "talk": 11.0, "walk": 7.0, "run": 5.0}
# How much of the clips' forward lean of the upper body to take out, and of the head's pitch.
SPINE_UPRIGHT = {"idle": 0.8, "talk": 0.8, "walk": 0.7, "run": 0.35}
NECK_LEVEL = 0.7
# Relaxed fingers: curl per joint (knuckle, middle, tip) in degrees. The Mixamo clips hold the
# fingers in a tight curl (claws on MakeHuman hands).
FINGER_CURL = {"idle": (10, 14, 9), "talk": (8, 12, 8), "walk": (12, 16, 10), "run": (22, 34, 22), "sit": (8, 12, 8)}
FINGERS = ("Index", "Middle", "Ring", "Pinky")
# The CC0 idle holds the wrists flexed ~17°: standing hands are turned half way back to the
# forearm's line.
WRIST_TO_REST = {"idle": 0.5}
# 1 for the cast; the player's clip rig (assets/animations/locomotion.glb) sets 0, because the
# player module settles the arms itself at run time (HumanFigure.ARM_SETTLE).
ARM_IN_SCALE = 1.0
P = "mixamorig:"

# glTF (x, y, z) -> Blender (x, -z, y)
C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
CT = C.transposed()

# The child joint that gives each bone its direction (source and target alike).
DIRECTION_CHILD = {
    "Hips": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck", "Neck": "Head",
    "Head": "HeadTop_End",
}
for _s in ("Left", "Right"):
    DIRECTION_CHILD.update({
        f"{_s}Shoulder": f"{_s}Arm", f"{_s}Arm": f"{_s}ForeArm", f"{_s}ForeArm": f"{_s}Hand",
        f"{_s}Hand": f"{_s}HandMiddle1", f"{_s}UpLeg": f"{_s}Leg", f"{_s}Leg": f"{_s}Foot",
        f"{_s}Foot": f"{_s}ToeBase", f"{_s}ToeBase": f"{_s}Toe_End",
    })
    for _f in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
        for _k in (1, 2, 3):
            DIRECTION_CHILD[f"{_s}Hand{_f}{_k}"] = f"{_s}Hand{_f}{_k + 1}"


def second_axis_kind(name):
    if "Hand" in name:
        return "palm"
    if "Arm" in name or "Shoulder" in name:
        return "forward"
    return "side"


# ----------------------------------------------------------------------------------------------
# Source clips (locomotion.glb)
# ----------------------------------------------------------------------------------------------
# Quaternius Universal Animation Library (CC0): Rigify deform bones -> our mixamo names.
UAL_BONES = {"DEF-hips": "Hips", "DEF-spine.001": "Spine", "DEF-spine.002": "Spine1", "DEF-spine.003": "Spine2",
             "DEF-neck": "Neck", "DEF-head": "Head"}
for _s, _x in (("Left", "L"), ("Right", "R")):
    UAL_BONES.update({f"DEF-shoulder.{_x}": f"{_s}Shoulder", f"DEF-upper_arm.{_x}": f"{_s}Arm", f"DEF-forearm.{_x}": f"{_s}ForeArm",
                      f"DEF-hand.{_x}": f"{_s}Hand", f"DEF-thigh.{_x}": f"{_s}UpLeg", f"DEF-shin.{_x}": f"{_s}Leg",
                      f"DEF-foot.{_x}": f"{_s}Foot", f"DEF-toe.{_x}": f"{_s}ToeBase"})
    for _f, _g in (("Index", "index"), ("Middle", "middle"), ("Ring", "ring"), ("Pinky", "pinky")):
        for _k in (1, 2, 3):
            UAL_BONES[f"DEF-f_{_g}.0{_k}.{_x}"] = f"{_s}Hand{_f}{_k}"
    for _k in (1, 2, 3):
        UAL_BONES[f"DEF-thumb.0{_k}.{_x}"] = f"{_s}HandThumb{_k}"
UAL_CLIPS = {"idle": "Idle_Loop", "walk": "Walk_Loop", "run": "Jog_Fwd_Loop"}


class SourceClips:
    """Clips from a glTF file whose bones are plain nodes. `bones` renames source bones to our
    mixamo names (default: strip `mixamorig:`); `clips` maps our clip names to the file's."""

    def __init__(self, path, bones=None, clips=None):
        data = open(path, "rb").read()
        n = struct.unpack("<I", data[12:16])[0]
        self.gltf = json.loads(data[20:20 + n])
        off = 20 + n
        blen = struct.unpack("<I", data[off:off + 4])[0]
        self.bin = data[off + 8:off + 8 + blen]
        nodes = self.gltf["nodes"]
        bones = bones or {}
        self.names = [bones.get(nd.get("name", ""), nd.get("name", "").replace(P, "")) for nd in nodes]
        self.parent = [-1] * len(nodes)
        for i, nd in enumerate(nodes):
            for ch in nd.get("children", []):
                self.parent[ch] = i
        self.index = {nm: i for i, nm in enumerate(self.names)}
        self.rest_t = [Vector(nd.get("translation", (0, 0, 0))) for nd in nodes]
        self.rest_r = [Quaternion((nd["rotation"][3], *nd["rotation"][:3])) if "rotation" in nd else Quaternion() for nd in nodes]
        self.rest_s = [Vector(nd.get("scale", (1, 1, 1))) for nd in nodes]
        by_name = {a["name"]: a for a in self.gltf["animations"]}
        self.clips = {ours: by_name[theirs] for ours, theirs in (clips or {k: k for k in by_name}).items()}
        # Rest-pose world rotations: identity for every Mixamo joint, not for Rigify bones.
        self.rest_rot = self.world()[0]

    def accessor(self, i):
        acc = self.gltf["accessors"][i]
        view = self.gltf["bufferViews"][acc["bufferView"]]
        width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[acc["type"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        arr = np.frombuffer(self.bin, np.float32, acc["count"] * width, start)
        return arr.reshape(acc["count"], width) if width > 1 else arr

    def duration(self, clip):
        anim = self.clips[clip]
        return max(float(self.accessor(s["input"]).max()) for s in anim["samplers"])

    def local_rotations(self, clip, t):
        """{node index: Quaternion} local rotations of the animated nodes at time t (linear/slerp)."""
        anim = self.clips[clip]
        out = {}
        for ch in anim["channels"]:
            if ch["target"]["path"] != "rotation":
                continue
            s = anim["samplers"][ch["sampler"]]
            times = self.accessor(s["input"])
            values = self.accessor(s["output"])
            k = int(np.searchsorted(times, t, side="right")) - 1
            k = max(0, min(k, len(times) - 1))
            if k >= len(times) - 1:
                q = values[-1]
                out[ch["target"]["node"]] = Quaternion((q[3], q[0], q[1], q[2]))
                continue
            f = (t - times[k]) / max(1e-6, times[k + 1] - times[k])
            a, b = values[k], values[k + 1]
            qa = Quaternion((a[3], a[0], a[1], a[2]))
            qb = Quaternion((b[3], b[0], b[1], b[2]))
            out[ch["target"]["node"]] = qa.slerp(qb, float(f))
        return out

    def world(self, local_rot=None):
        """World (Blender axes) rotation matrices and joint positions of every named bone."""
        local_rot = local_rot or {}
        n = len(self.names)
        mats = [None] * n

        def get(i):
            if mats[i] is not None:
                return mats[i]
            r = local_rot.get(i, self.rest_r[i])
            m = Matrix.LocRotScale(self.rest_t[i], r, self.rest_s[i])
            if self.parent[i] >= 0:
                m = get(self.parent[i]) @ m
            mats[i] = m
            return m

        rot, pos = {}, {}
        for i, nm in enumerate(self.names):
            m = get(i)
            r3 = m.to_3x3().normalized()
            rot[nm] = C @ r3 @ CT
            pos[nm] = C @ m.to_translation()
        return rot, pos


# ----------------------------------------------------------------------------------------------
# Frame alignment
# ----------------------------------------------------------------------------------------------
def frame(direction, second):
    d = direction.normalized()
    s = (second - d * second.dot(d))
    if s.length < 1e-6:
        s = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
        s = s - d * s.dot(d)
    s.normalize()
    return Matrix((d, s, d.cross(s))).transposed()  # columns d, s, d x s


def second_axis(kind, name, pos):
    side = "Left" if name.startswith("Left") else "Right"
    if kind == "palm":
        a, b = pos.get(f"{side}HandIndex1"), pos.get(f"{side}HandPinky1")
        if a is not None and b is not None:
            return a - b
        return Vector((0, -1, 0))
    if kind == "forward":
        return Vector((0, -1, 0))
    return Vector((1, 0, 0))


# ----------------------------------------------------------------------------------------------
# Target rig helpers
# ----------------------------------------------------------------------------------------------
class TargetRig:
    """MPFB mixamo skeleton in armature space (the armature object sits at the origin)."""

    def __init__(self, rig):
        self.rig = rig
        self.bones = [b for b in rig.data.bones]
        self.names = [b.name.replace(P, "") for b in self.bones]
        self.by_name = {nm: b for nm, b in zip(self.names, self.bones)}
        self.parent = {nm: (b.parent.name.replace(P, "") if b.parent else None) for nm, b in zip(self.names, self.bones)}
        self.rest = {nm: b.matrix_local.copy() for nm, b in zip(self.names, self.bones)}
        self.rest_rot = {nm: m.to_3x3().normalized() for nm, m in self.rest.items()}
        self.head = {nm: b.head_local.copy() for nm, b in zip(self.names, self.bones)}
        self.tail = {nm: b.tail_local.copy() for nm, b in zip(self.names, self.bones)}
        # Topological order (parents first).
        order, seen = [], set()

        def visit(nm):
            if nm in seen:
                return
            if self.parent[nm]:
                visit(self.parent[nm])
            seen.add(nm)
            order.append(nm)

        for nm in self.names:
            visit(nm)
        self.order = order

    def joint(self, name):
        if name in self.head:
            return self.head[name]
        # End joints the rig lacks (finger 4, HeadTop_End, Toe_End): the parent's tail.
        base = name.replace("_End", "").replace("4", "3").replace("HeadTop", "Head").replace("Toe", "ToeBase")
        for cand in (name[:-1] + "3" if name.endswith("4") else None, "Head" if name == "HeadTop_End" else None,
                     name.replace("Toe_End", "ToeBase")):
            if cand and cand in self.tail:
                return self.tail[cand]
        return self.tail.get(base)

    def direction(self, name):
        child = DIRECTION_CHILD.get(name)
        if child:
            j = self.joint(child)
            if j is not None and (j - self.head[name]).length > 1e-5:
                return j - self.head[name]
        return self.tail[name] - self.head[name]


def build_alignment(src, tgt):
    """R_align per target bone: turns the target's rest frame onto the source's rest frame."""
    _, spos = src.world()
    srot_rest, _ = src.world()
    align = {}
    tpos = {nm: tgt.head[nm] for nm in tgt.names}
    for nm in tgt.names:
        if nm not in src.index:
            continue
        if not ("Arm" in nm or "Shoulder" in nm or "Hand" in nm):
            # Spine, neck, head, legs and feet rest the same way in both rigs (upright, legs
            # straight down): the source's world-space motion is applied to the target's own
            # rest, so its stance and proportions are kept.
            align[nm] = Matrix.Identity(3)
            continue
        child = DIRECTION_CHILD.get(nm)
        if child is None or child not in spos:
            align[nm] = Matrix.Identity(3)
            continue
        kind = second_axis_kind(nm)
        fs = frame(spos[child] - spos[nm], second_axis(kind, nm, spos))
        ft = frame(tgt.direction(nm), second_axis(kind, nm, tpos))
        # Source rest frames are identity in their own space; in Blender axes they are C I C^T = I.
        align[nm] = fs @ ft.transposed()
    return align


def rot_about(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis.normalized())


# ----------------------------------------------------------------------------------------------
# Pose solving: world rotations -> local, FK, sole planting, keyframes
# ----------------------------------------------------------------------------------------------
def locals_from_world(tgt, world_rot):
    """Rotation of each bone relative to its parent (armature space rotations)."""
    out = {}
    for nm in tgt.order:
        p = tgt.parent[nm]
        out[nm] = (world_rot[p].transposed() @ world_rot[nm]) if p else world_rot[nm].copy()
    return out


def world_from_locals(tgt, local):
    world = {}
    for nm in tgt.order:
        p = tgt.parent[nm]
        world[nm] = world[p] @ local[nm] if p else local[nm].copy()
    return world


def turn_subtree(tgt, local, world, bone, axis, deg):
    """Turn `bone` (and so everything below it) about a world axis through its joint."""
    p = tgt.parent[bone]
    pr = world[p] if p else Matrix.Identity(3)
    local[bone] = pr.transposed() @ rot_about(axis, deg) @ pr @ local[bone]


def pose_matrices(tgt, local, hips_offset):
    """Full 4x4 pose matrices (armature space) from local rotations, hips moved by an offset."""
    mats = {}
    for nm in tgt.order:
        p = tgt.parent[nm]
        world_rot = (mats[p].to_3x3().normalized() @ local[nm]) if p else local[nm]
        if p:
            offset = tgt.rest[p].inverted() @ tgt.rest[nm]
            head = mats[p] @ offset.to_translation()
        else:
            head = tgt.head[nm] + hips_offset
        m = world_rot.to_4x4()
        m.translation = head
        mats[nm] = m
    return mats


def basis_matrices(tgt, mats):
    """Blender pose-bone matrix_basis for every bone from armature-space pose matrices."""
    out = {}
    for nm in tgt.order:
        p = tgt.parent[nm]
        rest_rel = (tgt.rest[p].inverted() @ tgt.rest[nm]) if p else tgt.rest[nm]
        parent = mats[p] if p else Matrix.Identity(4)
        out[nm] = rest_rel.inverted() @ parent.inverted() @ mats[nm]
    return out


class SoleSampler:
    """The lowest vertices of the feet (shoes, sandals) with their skin weights, for planting."""

    def __init__(self, tgt, body):
        world = body.matrix_world
        names = {g.index: g.name.replace(P, "") for g in body.vertex_groups}
        pts = []
        for v in body.data.vertices:
            p = world @ v.co
            if p.z > 0.06:
                continue
            ws = [(names[g.group], g.weight) for g in v.groups if g.weight > 1e-4 and names.get(g.group) in tgt.rest]
            if not ws:
                continue
            # Soles and shoes only: a hem or trouser cuff near the floor must not lift the feet.
            if sum(w for nm, w in ws if nm.endswith("Foot") or nm.endswith("ToeBase")) < 0.5:
                continue
            pts.append((p.copy(), ws))
        if not pts:
            raise RuntimeError("no sole vertices found")
        self.points = pts
        self.inv_rest = {nm: m.inverted() for nm, m in tgt.rest.items()}

    def lowest(self, mats):
        low = 1e9
        for p, ws in self.points:
            q = Vector((0, 0, 0))
            for nm, w in ws:
                q += (mats[nm] @ (self.inv_rest[nm] @ p)) * w
            low = min(low, q.z)
        return low


def solve_frame(tgt, sampler, local, extra_hips=Vector((0, 0, 0))):
    """Plant the soles: two passes (the offset is a pure translation, so one pass is exact up
    to rounding; the second only checks)."""
    offset = extra_hips.copy()
    for _ in range(2):
        mats = pose_matrices(tgt, local, offset)
        low = sampler.lowest(mats)
        offset.z -= low
    return pose_matrices(tgt, local, offset), offset


# ----------------------------------------------------------------------------------------------
# Clips
# ----------------------------------------------------------------------------------------------
# The Mixamo idle stands with the thighs ~9 degrees out, on top of MakeHuman's own slightly open
# rest: legs looked splayed. Standing clips bring the thighs in (the feet turned back flat).
LEGS_IN_DEG = {"idle": 4.0}
# The CC0 idle stands in a game "ready" stance (knees bent 21-27°, thighs 23° off vertical): most
# of the legs' motion is taken back towards the rest pose so people stand upright.
LEGS_TO_REST = {"idle": 0.75}
LEG_BONES = {f"{s}{b}" for s in ("Left", "Right") for b in ("UpLeg", "Leg", "Foot", "ToeBase")}
# Seated hands: the wrist's bend between the forearm and the hand, at most (degrees).
SIT_WRIST_MAX_DEG = 36.0


def retarget_pose(src, tgt, align, clip, t):
    srot, _ = src.world(src.local_rotations(clip, t))
    world = {}
    for nm in tgt.order:
        if nm in align and nm in srot:
            delta = srot[nm] @ src.rest_rot[nm].transposed()
            if nm in LEG_BONES and LEGS_TO_REST.get(clip):
                delta = Quaternion().slerp(delta.to_quaternion(), 1 - LEGS_TO_REST[clip]).to_matrix()
            world[nm] = delta @ align[nm] @ tgt.rest_rot[nm]
        else:
            p = tgt.parent[nm]
            rel = tgt.rest_rot[p].transposed() @ tgt.rest_rot[nm] if p else tgt.rest_rot[nm]
            world[nm] = (world[p] @ rel) if p else rel
    local = locals_from_world(tgt, world)
    straighten(tgt, local, SPINE_UPRIGHT.get(clip, 0.7))
    world = world_from_locals(tgt, local)
    arm_in = ARM_IN_BY_CLIP.get(clip, ARM_IN_DEG) * ARM_IN_SCALE
    for side, sign in (("Left", 1), ("Right", -1)):
        turn_subtree(tgt, local, world, side + "Arm", Vector((0, 1, 0)), sign * arm_in)
        world = world_from_locals(tgt, local)
    if WRIST_TO_REST.get(clip):
        for side in ("Left", "Right"):
            nm = side + "Hand"
            rest = (tgt.rest_rot[tgt.parent[nm]].transposed() @ tgt.rest_rot[nm]).to_quaternion()
            local[nm] = local[nm].to_quaternion().slerp(rest, WRIST_TO_REST[clip]).to_matrix()
    relax_fingers(tgt, local, FINGER_CURL.get(clip, FINGER_CURL["idle"]))
    legs_in = LEGS_IN_DEG.get(clip, 0.0)
    if legs_in:
        for side, sign in (("Left", 1), ("Right", -1)):
            world = world_from_locals(tgt, local)
            turn_subtree(tgt, local, world, side + "UpLeg", Vector((0, 1, 0)), sign * legs_in)
            world = world_from_locals(tgt, local)
            turn_subtree(tgt, local, world, side + "Foot", Vector((0, 1, 0)), -sign * legs_in)
    return local


def pitch_forward(direction):
    """Forward lean (degrees) of an upward direction: positive when it tips towards -Y."""
    return math.degrees(math.atan2(-direction.y, max(1e-6, direction.z)))


def straighten(tgt, local, amount):
    """Take `amount` of the upper body's forward lean out (turning the spine's subtree back),
    then level the head (the clips walk with a stoop and a dropped head)."""
    world = world_from_locals(tgt, local)
    # Relative to the rest pose: MakeHuman's spine and head bones are not vertical at rest.
    lean = pitch_forward(world["Spine2"] @ Vector((0, 1, 0))) - pitch_forward(tgt.rest_rot["Spine2"] @ Vector((0, 1, 0)))
    if lean > 0:
        # Rx(+a) tips an upward vector forward, so turn back by -amount * lean.
        turn_subtree(tgt, local, world, "Spine", Vector((1, 0, 0)), -amount * lean)
        world = world_from_locals(tgt, local)
    head = pitch_forward(world["Head"] @ Vector((0, 1, 0))) - pitch_forward(tgt.rest_rot["Head"] @ Vector((0, 1, 0)))
    if head > 0:
        turn_subtree(tgt, local, world, "Neck", Vector((1, 0, 0)), -NECK_LEVEL * head)


def palm_frames(tgt):
    """Per hand, the palm's normal and its index-to-pinky axis in the hand bone's own frame."""
    if hasattr(tgt, "_palm"):
        return tgt._palm
    out = {}
    for side, sign in (("Left", 1), ("Right", -1)):
        hand = tgt.head[side + "Hand"]
        d = (tgt.head[side + "HandMiddle1"] - hand).normalized()
        across = (tgt.head[side + "HandIndex1"] - tgt.head[side + "HandPinky1"]).normalized()
        n = d.cross(across).normalized()
        if n.x * sign > 0:  # the palm faces the body at rest (A-pose, arms down)
            n = -n
        q = tgt.rest_rot[side + "Hand"]
        out[side] = (q.transposed() @ n, q.transposed() @ across)
    tgt._palm = out
    return out


def relax_fingers(tgt, local, curl):
    """Fingers back to their straight rest, then a gentle curl towards the palm per joint.
    Thumbs stay at rest (resting along the index finger)."""
    palms = palm_frames(tgt)
    for side in ("Left", "Right"):
        for finger in FINGERS:
            for k in (1, 2, 3):
                nm = f"{side}Hand{finger}{k}"
                p = tgt.parent[nm]
                local[nm] = tgt.rest_rot[p].transposed() @ tgt.rest_rot[nm]
        world = world_from_locals(tgt, local)
        n_local, across_local = palms[side]
        normal = (world[side + "Hand"] @ n_local).normalized()
        axis = (world[side + "Hand"] @ across_local).normalized()
        for finger in FINGERS:
            for k, deg in zip((1, 2, 3), curl):
                nm = f"{side}Hand{finger}{k}"
                d = world[nm] @ Vector((0, 1, 0))
                sign = 1 if axis.cross(d).dot(normal) > 0 else -1
                turn_subtree(tgt, local, world, nm, axis, sign * deg)
                # Only this finger's chain moved: update its world rotations, not the skeleton's.
                for j in range(k, 4):
                    cj = f"{side}Hand{finger}{j}"
                    world[cj] = world[tgt.parent[cj]] @ local[cj]


def rotation_between(a, b):
    return a.normalized().rotation_difference(b.normalized()).to_matrix()


def aim_bone(tgt, local, bone, child, target):
    """Turn `bone` so its joint-to-child line points at `target` (armature space)."""
    mats = pose_matrices(tgt, local, Vector((0, 0, 0)))
    head = mats[bone].translation
    tip = mats[child].translation
    world = world_from_locals(tgt, local)
    p = tgt.parent[bone]
    pr = world[p] if p else Matrix.Identity(3)
    local[bone] = pr.transposed() @ rotation_between(tip - head, target - head) @ pr @ local[bone]


def hand_on_thigh(tgt, local, side, sign):
    """Two-bone IK: the hand on top of the thigh, a little behind the knee, elbow out and back."""
    mats = pose_matrices(tgt, local, Vector((0, 0, 0)))
    hip, knee = mats[side + "UpLeg"].translation, mats[side + "Leg"].translation
    target = hip * 0.4 + knee * 0.6 + Vector((0, 0, 0.1))
    s = mats[side + "Arm"].translation
    l1 = (tgt.head[side + "ForeArm"] - tgt.head[side + "Arm"]).length
    l2 = (tgt.head[side + "Hand"] - tgt.head[side + "ForeArm"]).length
    to = target - s
    d = min(to.length, (l1 + l2) * 0.995)
    u = to.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    pole = Vector((sign * 0.5, 1.0, 0.0))
    pole = (pole - u * pole.dot(u)).normalized()
    elbow = s + u * a + pole * h
    aim_bone(tgt, local, side + "Arm", side + "ForeArm", elbow)
    aim_bone(tgt, local, side + "ForeArm", side + "Hand", s + u * d)
    # The hand lies along the thigh, fingers towards the knee.
    # The wrist bends at most SIT_WRIST_MAX_DEG: past that the hand is turned towards the
    # forearm's line (a hand laid flat across a steep forearm reads as a broken wrist).
    mats = pose_matrices(tgt, local, Vector((0, 0, 0)))
    wrist = mats[side + "Hand"].translation
    fore = (wrist - mats[side + "ForeArm"].translation).normalized()
    want = ((knee - hip).normalized() + Vector((0, 0, -0.15))).normalized()
    bend = math.degrees(fore.angle(want))
    if bend > SIT_WRIST_MAX_DEG:
        want = fore.slerp(want, SIT_WRIST_MAX_DEG / bend).normalized()
    aim_bone(tgt, local, side + "Hand", side + "HandMiddle1", wrist + want)


def frames_for(duration):
    return max(2, int(round(duration * FPS)))


def make_clips(src, tgt, body):
    """{clip: [(time, matrices, hips_offset)]} for the five clips, all looping (the last frame
    equals the first)."""
    align = build_alignment(src, tgt)
    sampler = SoleSampler(tgt, body)
    clips = {}
    for clip in ("idle", "walk", "run"):
        dur = src.duration(clip)
        n = frames_for(dur)
        frames = []
        for k in range(n + 1):
            t = dur * k / n
            local = retarget_pose(src, tgt, align, clip, min(t, dur) if k < n else 0.0)
            mats, off = solve_frame(tgt, sampler, local)
            frames.append((k / FPS, mats, off))
        clips[clip] = frames

    # ---- talk: the idle twice over (5 s), gestures and nods laid over it.
    idle_dur = src.duration("idle")
    talk_dur = idle_dur * 2
    n = frames_for(talk_dur)
    frames = []
    for k in range(n + 1):
        t = (talk_dur * k / n) % talk_dur
        local = retarget_pose(src, tgt, align, "idle", t % idle_dur)
        apply_talk(tgt, local, t / talk_dur)
        mats, off = solve_frame(tgt, sampler, local)
        frames.append((k / FPS, mats, off))
    clips["talk"] = frames

    # ---- sit: on a seat at knee height, hands on the thighs, slow breathing (4 s).
    sit_dur = 4.0
    n = frames_for(sit_dur)
    base = retarget_pose(src, tgt, align, "idle", 0.0)
    # The legs start from the rest pose, not the idle's stance, so the seat height and the
    # thighs do not depend on the idle's knee bend (the sit is the same whatever idle is used).
    for nm in LEG_BONES:
        p = tgt.parent[nm]
        base[nm] = tgt.rest_rot[p].transposed() @ tgt.rest_rot[nm]
    frames = []
    for k in range(n + 1):
        phase = (k / n) % 1.0
        local = {nm: m.copy() for nm, m in base.items()}
        apply_sit(tgt, local, phase)
        mats, off = solve_frame(tgt, sampler, local)
        frames.append((k / FPS, mats, off))
    clips["sit"] = frames
    return clips


def elbow_axis(world, tgt, side):
    arm = world[side + "Arm"] @ Vector((0, 1, 0))
    axis = arm.cross(Vector((0, -1, 0)))
    if axis.length < 1e-4:
        axis = Vector((1, 0, 0))
    return axis.normalized()


def apply_talk(tgt, local, phase):
    """Hand gestures (right hand leads, left joins less), head nods and a slow head turn.
    All terms are whole cycles over the clip, so it loops."""
    two_pi = 2 * math.pi
    world = world_from_locals(tgt, local)
    # Right arm a little forward, forearm raised, moving in beats.
    beat = math.sin(two_pi * 4 * phase)
    sway = math.sin(two_pi * 2 * phase + 0.6)
    turn_subtree(tgt, local, world, "RightArm", Vector((1, 0, 0)), -(14 + 6 * sway))
    world = world_from_locals(tgt, local)
    turn_subtree(tgt, local, world, "RightForeArm", elbow_axis(world, tgt, "Right"), 58 + 16 * beat)
    world = world_from_locals(tgt, local)
    turn_subtree(tgt, local, world, "RightHand", world["RightForeArm"] @ Vector((0, 1, 0)), 25 * math.sin(two_pi * 2 * phase))
    world = world_from_locals(tgt, local)
    lbeat = math.sin(two_pi * 3 * phase + 1.3)
    turn_subtree(tgt, local, world, "LeftArm", Vector((1, 0, 0)), -(6 + 4 * lbeat))
    world = world_from_locals(tgt, local)
    turn_subtree(tgt, local, world, "LeftForeArm", elbow_axis(world, tgt, "Left"), 30 + 18 * max(0.0, lbeat))
    world = world_from_locals(tgt, local)
    # Head: nods and a slow turn towards the listener and back.
    turn_subtree(tgt, local, world, "Head", Vector((1, 0, 0)), 4 * math.sin(two_pi * 5 * phase))
    world = world_from_locals(tgt, local)
    turn_subtree(tgt, local, world, "Neck", Vector((0, 0, 1)), 8 * math.sin(two_pi * 1 * phase))


def apply_sit(tgt, local, phase):
    two_pi = 2 * math.pi
    world = world_from_locals(tgt, local)
    for side in ("Left", "Right"):
        # Thigh forward (horizontal), shin back to vertical, foot flat.
        turn_subtree(tgt, local, world, side + "UpLeg", Vector((1, 0, 0)), -88)
        world = world_from_locals(tgt, local)
        turn_subtree(tgt, local, world, side + "Leg", Vector((1, 0, 0)), 86)
        world = world_from_locals(tgt, local)
    # Knees a little apart.
    turn_subtree(tgt, local, world, "LeftUpLeg", Vector((0, 0, 1)), 6)
    world = world_from_locals(tgt, local)
    turn_subtree(tgt, local, world, "RightUpLeg", Vector((0, 0, 1)), -6)
    world = world_from_locals(tgt, local)
    # Slight forward lean and breathing.
    turn_subtree(tgt, local, world, "Spine", Vector((1, 0, 0)), 4 + 1.2 * math.sin(two_pi * phase))
    world = world_from_locals(tgt, local)
    # Hands resting on the thighs (two-bone IK per arm), fingers relaxed.
    for side, sign in (("Left", 1), ("Right", -1)):
        hand_on_thigh(tgt, local, side, sign)
    relax_fingers(tgt, local, FINGER_CURL["sit"])
    world = world_from_locals(tgt, local)
    turn_subtree(tgt, local, world, "Head", Vector((0, 0, 1)), 5 * math.sin(two_pi * phase))


# ----------------------------------------------------------------------------------------------
# Blender actions
# ----------------------------------------------------------------------------------------------
def bake_to_rig(rig, tgt, clips):
    """One action per clip, pushed to an NLA track of the same name (the glTF exporter writes one
    animation per track)."""
    import bpy
    # Keys are one per 1/FPS s: the scene must run at FPS too (Blender's default is 24 fps, which
    # had stretched every clip by a quarter until 24 Nov 2026).
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1.0
    rig.animation_data_create()
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for clip in CLIPS:
        frames = clips[clip]
        action = bpy.data.actions.new(clip)
        rig.animation_data.action = action
        for k, (_, mats, _) in enumerate(frames):
            basis = basis_matrices(tgt, mats)
            for nm in tgt.order:
                pb = rig.pose.bones[P + nm]
                loc, rot, _ = basis[nm].decompose()
                pb.rotation_quaternion = rot
                pb.keyframe_insert("rotation_quaternion", frame=k + 1, group=nm)
                if tgt.parent[nm] is None:
                    pb.location = loc
                    pb.keyframe_insert("location", frame=k + 1, group=nm)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 1, action)
        strip.name = clip
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)


def seat_height(tgt, clips):
    """Height of the hips joint in the sit clip's first frame (the seat is ~0.1 m lower)."""
    mats = clips["sit"][0][1]
    return float(mats["Hips"].translation.z)


def ground_speed(clips, clip):
    """Speed (m/s) the body must move at playback rate 1 for the feet not to slide: each foot
    swings over a range D relative to the hips (in place), and two steps per loop cover 2 D."""
    frames = clips[clip]
    dur = frames[-1][0]
    ranges = []
    for side in ("Left", "Right"):
        ys = [mats[side + "Foot"].translation.y - mats["Hips"].translation.y for _, mats, _ in frames]
        ranges.append(max(ys) - min(ys))
    return 2 * (sum(ranges) / len(ranges)) / dur

