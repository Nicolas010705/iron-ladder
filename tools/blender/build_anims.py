"""Iron Ladder – Übungs-Animationen in Blender bauen und als GLB exportieren.

Aufruf (aus dem Repo-Ordner):
    blender -b -P tools/blender/build_anims.py
Eingabe:  tools/3d/anim.raw/bake/*.json   (aufgenommen mit  node tools/3d/bake.mjs)
Ausgabe:  tools/3d/anim.raw/glb/<muster>-<gerät>.glb   (nur Skelett + Animation, eine Aktion je Datei)
          tools/3d/anim.raw/anims.blend                  (alle Aktionen zum Bearbeiten in Blender)
Danach:   cd tools/3d && node build.mjs   (komprimiert nach 3d/anim/)

Jede Kombination wird eine Blender-Aktion mit Keyframes am Skelett von 3d/body.glb (Bild 0…120 = Bewegung t 0…1).
Von Hand in Blender animierte Übungen stehen in HANDMADE und ersetzen die aufgenommene Armbewegung.
"""
import json, math, pathlib, sys, time
import bpy
from mathutils import Matrix, Quaternion, Vector

REPO = pathlib.Path(__file__).resolve().parents[2]
BAKE = REPO / 'tools' / '3d' / 'anim.raw' / 'bake'
OUT = REPO / 'tools' / '3d' / 'anim.raw' / 'glb'
OUT.mkdir(parents=True, exist_ok=True)
CONV = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # glTF (y oben) -> Blender (z oben)
only = [a for a in sys.argv[sys.argv.index('--') + 1:]] if '--' in sys.argv else []

def sanitize(n):  # wie THREE.PropertyBinding.sanitizeNodeName / bname() in figure.js
    for ch in '[].:/': n = n.replace(ch, '')
    return n.replace(' ', '_')

def mat(v):  # [px,py,pz,qx,qy,qz,qw] -> 4x4
    return Matrix.Translation(Vector(v[:3])) @ Quaternion((v[6], v[3], v[4], v[5])).to_matrix().to_4x4()

# ---------------- Szene ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 120; sc.frame_start = 0; sc.frame_end = 120
bpy.ops.import_scene.gltf(filepath=str(REPO / '3d' / 'body.glb'))
rig = next(o for o in sc.objects if o.type == 'ARMATURE')
for o in list(sc.objects):
    if o.type == 'MESH' and o.parent is None: bpy.data.objects.remove(o, do_unlink=True)
assert rig.matrix_world == Matrix.Identity(4), 'Rig muss im Ursprung liegen'
rest = json.loads((BAKE / '_rest.json').read_text())
B = {sanitize(b.name): b for b in rig.data.bones}
missing = [n for n in rest['names'] if n not in B]
assert not missing, f'Knochen fehlen in Blender: {missing}'
order = rest['names']  # Eltern vor Kindern (Reihenfolge aus three.js)
REST = {n: B[n].matrix_local.copy() for n in order}
C = {n: (CONV @ mat(rest['rest'][n])).inverted() @ REST[n] for n in order}  # Achsen-Korrektur je Knochen
PAR = {n: rest['parents'][n] for n in order}

for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'

def basis_frames(frames):
    """Weltlagen je Bild -> Blender-Basis (lokal zum Ruhe-Knochen) je Knochen: {name: [(loc, quat), …]}"""
    out = {n: [] for n in order}
    for fr in frames:
        A = {n: CONV @ mat(fr[n]) @ C[n] for n in order}
        for n in order:
            p = PAR[n]
            M = REST[n].inverted() @ A[n] if p is None else REST[n].inverted() @ REST[p] @ A[p].inverted() @ A[n]
            loc, q, _ = M.decompose(); out[n].append((loc, q))
    for n in order:  # Vorzeichen stetig halten (kein Umklappen beim Interpolieren)
        seq = out[n]
        for i in range(1, len(seq)):
            if seq[i][1].dot(seq[i - 1][1]) < 0: seq[i] = (seq[i][0], -seq[i][1])
    return out

def write_action(name, data):
    from bpy_extras import anim_utils
    act = bpy.data.actions.new(name); act.use_fake_user = True
    rig.animation_data_create(); rig.animation_data.action = act
    slot = act.slots.new('OBJECT', rig.name) if not act.slots else act.slots[0]
    rig.animation_data.action_slot = slot
    cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)
    for n, seq in data.items():
        bn = B[n].name; nf = len(seq)
        chans = [('rotation_quaternion', 4, lambda s, i: s[1][i])]
        if any(s[0].length > 1e-5 for s in seq): chans.append(('location', 3, lambda s, i: s[0][i]))
        for path, cnt, get in chans:
            for i in range(cnt):
                fc = cb.fcurves.new(f'pose.bones["{bn}"].{path}', index=i, group_name=bn)
                fc.keyframe_points.add(nf)
                co = []
                for f, s in enumerate(seq): co += [float(f), get(s, i)]
                fc.keyframe_points.foreach_set('co', co)
                for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
                fc.update()
    return act

# ---------------- Von Hand animiert (ersetzt die Armbewegung) ----------------
def handmade_curl(data, nframes):
    """Kurzhantel-Curl wie in der Demo (tools/blender/demo_curl.py): Arme in Blender gestellt, t = Anteil der Beugung."""
    g = {'__name__': 'demo_curl', '__file__': str(REPO / 'tools' / 'blender' / 'demo_curl.py')}
    exec((REPO / 'tools' / 'blender' / 'demo_curl.py').read_text(encoding='utf-8'), g)
    bones = g['ARM'] + g['FINGERS'] + ['shoulder01']
    names = [sanitize(f'{b}.{s}') for b in bones for s in 'LR']
    for f in range(nframes):
        for n in order:  # aufgenommene Pose für dieses Bild setzen (Rumpf, Schultergürtel …)
            pb = rig.pose.bones[B[n].name]; loc, q = data[n][f]; pb.location = loc; pb.rotation_quaternion = q
        bpy.context.view_layer.update()
        t = f / (nframes - 1)
        for s in 'LR':
            kw = {k: g['BOTTOM'][k] + (g['TOP'][k] - g['BOTTOM'][k]) * t for k in g['BOTTOM']}
            g['pose_arm'](rig, s, **kw)
        for n in names:
            pb = rig.pose.bones[B[n].name]; q = pb.rotation_quaternion.copy()
            if f and q.dot(data[n][f - 1][1]) < 0: q = -q
            data[n][f] = (pb.location.copy(), q)
    for pb in rig.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
    return data

HANDMADE = {'curl-KH': handmade_curl}

# ---------------- Export ----------------
def export(name, act):
    rig.animation_data.action = act
    bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(OUT / f'{name}.glb'), export_format='GLB', use_selection=True, export_yup=True,
                              export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_force_sampling=True,
                              export_frame_range=True, export_anim_slide_to_zero=True, export_optimize_animation_size=True,
                              export_optimize_animation_keep_anim_armature=False, export_skins=False, export_materials='NONE',
                              export_def_bones=False, export_rest_position_armature=True, export_anim_single_armature=True)

t0 = time.time(); done = []
files = sorted(f for f in BAKE.glob('*.json') if not f.name.startswith('_'))
for f in files:
    key = f.stem
    if only and key.split('-')[0] not in only and key not in only: continue
    d = json.loads(f.read_text())
    data = basis_frames(d['frames'])
    if key in HANDMADE: data = HANDMADE[key](data, len(d['frames']))
    act = write_action(key, data)
    export(key, act); done.append(key)
rig.animation_data.action = None
for pb in rig.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT.parent / 'anims.blend'))
print(f'IRON_ANIMS {len(done)} Aktionen exportiert in {time.time() - t0:.0f} s')
