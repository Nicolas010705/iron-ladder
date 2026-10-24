"""Iron Ladder – 3D-Trainingsfigur aus MakeHuman-Daten (CC0) mit Blender bauen.

Aufruf (Blender als Python-Modul, `pip install bpy`, oder `blender -b -P`):
    python3 tools/blender/build_model.py <makehuman-data-ordner> <ausgabe.glb>

Der Datenordner braucht aus github.com/makehumancommunity/makehuman (makehuman/data):
    3dobjs/base.obj, rigs/default.mhskel, rigs/default_weights.mhw,
    targets/macrodetails/universal-male-young-{averagemuscle,maxmuscle}-{averageweight,minweight}.target,
    targets/macrodetails/proportions/male-young-averagemuscle-averageweight-idealproportions.target
    targets/macrodetails/{african,asian,caucasian}-male-young.target
(flach abgelegt; siehe fetch_sources.sh).

Ergebnis: ein geriggtes Mesh (athletischer Körper, vereinfachtes Skelett mit Fingern)
und pro Vertex eine Muskelregion im Farbattribut (R-Kanal = id/31), die die App
zum Hervorheben der trainierten Muskeln nutzt.
"""
import sys, json, math, pathlib
import numpy as np
import bpy

SRC = pathlib.Path(sys.argv[-2]); OUT = pathlib.Path(sys.argv[-1])

# Muskel-IDs = Schlüssel der App (MUSCLES), Reihenfolge nicht ändern
REGIONS = ['none', 'chest_up', 'chest_mid', 'chest_low', 'lats', 'upback', 'traps', 'lower',
           'delt_front', 'delt_side', 'delt_rear', 'biceps', 'triceps', 'forearms',
           'abs', 'obliques', 'quads', 'hams', 'glutes', 'adductors', 'calves']
RID = {n: i for i, n in enumerate(REGIONS)}

# ---------- Mesh + Targets ----------
V = []; groups = {}; cur = None
for line in open(SRC / 'base.obj'):
    if line.startswith('v '):
        V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '):
        cur = line.split()[1]
    elif line.startswith('f '):
        groups.setdefault(cur, []).append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
V = np.array(V)

def load_target(name):
    d = np.zeros_like(V)
    for line in open(SRC / name):
        if line.startswith('#') or not line.strip():
            continue
        i, x, y, z = line.split()
        d[int(i)] = (float(x), float(y), float(z))
    return d

# Männlich, 25 Jahre, gemischte Herkunft (je 1/3); athletisch: viel Muskulatur, eher schlank
mus, wgt = 0.85, 0.6          # Anteil max-muscle / Anteil min-weight im Gemisch
V = V + sum(load_target(f'{e}-male-young.target') for e in ('african', 'asian', 'caucasian')) / 3
V = V + (1 - mus) * (1 - wgt) * load_target('universal-male-young-averagemuscle-averageweight.target') \
      + (1 - mus) * wgt * load_target('universal-male-young-averagemuscle-minweight.target') \
      + mus * (1 - wgt) * load_target('universal-male-young-maxmuscle-averageweight.target') \
      + mus * wgt * load_target('universal-male-young-maxmuscle-minweight.target') \
      + 0.6 * load_target('male-young-averagemuscle-averageweight-idealproportions.target')

# ---------- Skelett ----------
sk = json.load(open(SRC / 'default.mhskel'))
jp = lambda n: V[sk['joints'][n]].mean(0)
bones = sk['bones']

KEEP = set(['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head'])
for s in 'LR':
    KEEP |= {f'{b}.{s}' for b in ['clavicle', 'shoulder01', 'upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02',
                                  'wrist', 'metacarpal1', 'metacarpal2', 'metacarpal3', 'metacarpal4',
                                  'pelvis', 'upperleg01', 'upperleg02', 'lowerleg01', 'lowerleg02', 'foot']}
    KEEP |= {f'finger{f}-{k}.{s}' for f in range(1, 6) for k in range(1, 4)}

def kept_ancestor(b):
    while b not in KEEP:
        b = bones[b]['parent']
    return b

W = json.load(open(SRC / 'default_weights.mhw'))['weights']
vw = {}  # vertex -> {bone: w}
for b, lst in W.items():
    kb = kept_ancestor(b)
    for vi, w in lst:
        d = vw.setdefault(vi, {}); d[kb] = d.get(kb, 0) + w

# ---------- Körpermaße für die Muskelregionen ----------
def J(n, end='head'): return jp(f'{n}____{end}')
shoulder = J('upperarm01.L'); elbow = J('lowerarm01.L'); wrist = J('wrist.L')
hip = J('upperleg01.L'); knee = J('lowerleg01.L'); ankle = J('foot.L')
neck = J('neck01'); clav = J('clavicle.L', 'tail')
nipple = J('breast.L', 'tail')
spine_pts = np.array([J(b) for b in ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01']])

def spine_z(y):
    o = np.argsort(spine_pts[:, 1]); return np.interp(y, spine_pts[o, 1], spine_pts[o, 2])

body_faces = groups['body']
eye_faces = groups['helper-l-eye'] + groups['helper-r-eye']
used = sorted({i for f in body_faces + eye_faces for i in f})
remap = {o: n for n, o in enumerate(used)}
P = V[used]
eye_set = {remap[i] for f in eye_faces for i in f}

def dominant(vi):
    d = vw.get(vi, {}); return max(d, key=d.get) if d else 'root'

def radial(p, a, b):
    ax = b - a; L = np.linalg.norm(ax); ax = ax / L
    t = np.dot(p - a, ax) / L
    r = (p - a) - np.dot(p - a, ax) * ax
    return t, r, ax

pec_top = clav[1] - 0.05
pec_low = nipple[1] - 0.55
waist = pec_low - 1.9
iliac = hip[1] + 0.55
crotch = hip[1] - 0.95
region = np.zeros(len(P), dtype=int)
for n, o in enumerate(used):
    if n in eye_set:
        continue
    p = V[o].copy(); dom = dominant(o)
    side = 1 if p[0] >= 0 else -1
    q = p.copy(); q[0] = abs(q[0])                    # auf linke Körperhälfte spiegeln
    base = dom.split('.')[0]
    reg = 'none'
    zc = spine_z(q[1]) + 0.35                         # Grenze vorne/hinten im Rumpf
    if base in ('shoulder01', 'upperarm01', 'upperarm02', 'clavicle') or (base.startswith('spine') and q[0] > shoulder[0] - 0.25 and q[1] > shoulder[1] - 0.9):
        t, r, ax = radial(q, shoulder, elbow)
        out = np.array([1.0, 0, 0]); out -= np.dot(out, ax) * ax; out /= np.linalg.norm(out)
        fr = np.array([0, 0, 1.0]); fr -= np.dot(fr, ax) * ax; fr /= np.linalg.norm(fr)
        rn = r / (np.linalg.norm(r) + 1e-9)
        a = math.degrees(math.atan2(np.dot(rn, fr), np.dot(rn, out)))   # 0 = außen, +90 = vorn, -90 = hinten
        if q[0] < shoulder[0] - 0.45 and t < 0.2:
            reg = 'traps' if q[2] < zc + 0.3 or q[1] > pec_top + 0.15 else ('chest_up' if q[1] < pec_top + 0.15 else 'none')
        elif base == 'clavicle' and q[0] < shoulder[0] - 0.35:
            reg = 'traps' if q[2] < zc + 0.3 else ('chest_up' if q[1] < pec_top else 'none')
        elif t < 0.4 and not (abs(a) > 125 and t > 0.12):
            reg = 'delt_front' if a > 40 else ('delt_rear' if a < -40 else 'delt_side')
            if t < -0.05 and q[0] < shoulder[0] - 0.1:
                reg = 'traps' if q[2] < zc + 0.2 else 'chest_up'
        elif t < 0.93:
            reg = 'biceps' if (a > 15 and a < 165) else 'triceps'
        else:
            reg = 'none'
    elif base in ('lowerarm01', 'lowerarm02'):
        t, r, ax = radial(q, elbow, wrist); reg = 'forearms' if 0.04 < t < 0.92 else 'none'
    elif base in ('upperleg01', 'upperleg02', 'pelvis', 'root') or (base.startswith('spine') and q[1] < iliac):
        t, r, ax = radial(q, hip, knee)
        fr = np.array([0, 0, 1.0]); fr -= np.dot(fr, ax) * ax; fr /= np.linalg.norm(fr)
        out = np.array([1.0, 0, 0]); out -= np.dot(out, ax) * ax; out /= np.linalg.norm(out)
        rn = r / (np.linalg.norm(r) + 1e-9)
        a = math.degrees(math.atan2(np.dot(rn, fr), np.dot(rn, out)))   # 0 außen, 90 vorn, -90 hinten, 180 innen
        back = q[2] < zc - 0.1
        if q[1] > iliac - 0.05:
            reg = 'lower' if (back and q[0] < 0.75) else ('obliques' if q[0] > 0.8 else ('abs' if not back else 'none'))
        elif (back or a < -60) and q[1] > crotch - 0.5 and q[0] > 0.12:
            reg = 'glutes'
        elif t < -0.05:
            reg = 'none'
        elif t > 0.9:
            reg = 'none'
        elif abs(a) > 150 or (a > 115 and t < 0.55):
            reg = 'adductors'
        elif a > -20:
            reg = 'quads'
        else:
            reg = 'hams'
    elif base in ('lowerleg01', 'lowerleg02'):
        t, r, ax = radial(q, knee, ankle)
        reg = 'calves' if (r[2] < 0.05 and 0.06 < t < 0.78) else 'none'
    elif base.startswith('spine') or base in ('neck01',):
        front = q[2] > zc
        if q[1] > shoulder[1] - 0.15 and not front and q[0] < shoulder[0] - 0.15:
            reg = 'traps'
        elif base == 'neck01' or q[1] > neck[1] - 0.1:
            reg = 'traps' if not front else 'none'
        elif front and q[1] > pec_low and q[1] < pec_top + 0.1 and q[0] < shoulder[0] - 0.05:
            h = (pec_top - q[1]) / (pec_top - pec_low)
            reg = 'chest_up' if h < 0.33 else ('chest_mid' if h < 0.7 else 'chest_low')
        elif front and q[1] <= pec_low:
            reg = 'abs' if q[0] < 0.62 else 'obliques'
            if q[1] > pec_low - 0.25 and q[0] > 1.05: reg = 'lats'
        elif not front:
            if q[1] > pec_low + 0.2 and q[0] < 1.25:
                reg = 'upback'
            elif q[1] > waist + 0.3 and q[0] > 0.55:
                reg = 'lats'
            elif q[0] < 0.75:
                reg = 'lower'
            else:
                reg = 'obliques'
        elif q[1] > pec_top:
            reg = 'none'
        else:
            reg = 'lats' if q[1] > waist else 'obliques'
    region[n] = RID[reg]

# ---------- In Blender aufbauen ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
S = 0.1; Y0 = -V[used][:, 1].min()
def bl(p):  # MakeHuman (x, y-oben, z-vorn, dm) -> Blender (x, -z, y, m), Füße auf 0
    return ((p[0]) * S, -p[2] * S, (p[1] + Y0) * S)

me = bpy.data.meshes.new('Body')
faces = [[remap[i] for i in f] for f in body_faces + eye_faces]
me.from_pydata([bl(p) for p in P], [], faces)
me.update()
for poly in me.polygons: poly.use_smooth = True
ob = bpy.data.objects.new('Body', me); bpy.context.scene.collection.objects.link(ob)

col = me.color_attributes.new('Muscle', 'FLOAT_COLOR', 'POINT')
for i, r in enumerate(region):
    col.data[i].color = (r / 31.0, 0.0, 0.0, 1.0)
me.color_attributes.active_color = col

arm = bpy.data.armatures.new('Rig'); rig = bpy.data.objects.new('Rig', arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
order = []
def add(b):
    if b in order: return
    par = bones[b]['parent']
    if par:
        add(kept_ancestor(par))
    order.append(b)
for b in sorted(KEEP): add(b)
for b in order:
    eb = arm.edit_bones.new(b)
    eb.head = bl(jp(bones[b]['head'])); eb.tail = bl(jp(bones[b]['tail']))
    par = bones[b]['parent']
    if par:
        eb.parent = arm.edit_bones[kept_ancestor(par)]
# Hilfsknochen ohne Gewichte: Zehenspitzen und Scheitel (Richtungen für die App)
for s in 'LR':
    eb = arm.edit_bones.new(f'toe.{s}'); t = jp(bones[f'foot.{s}']['tail'])
    eb.head = bl(t); eb.tail = bl(t + np.array([0, 0, 0.4])); eb.parent = arm.edit_bones[f'foot.{s}']
eb = arm.edit_bones.new('headtop'); t = jp(bones['head']['tail'])
eb.head = bl(t); eb.tail = bl(t + np.array([0, 0.4, 0])); eb.parent = arm.edit_bones['head']
bpy.ops.object.mode_set(mode='OBJECT')

for b in order: ob.vertex_groups.new(name=b)
for n, o in enumerate(used):
    d = vw.get(o, {'head': 1.0}) if n not in eye_set else {'head': 1.0}
    tot = sum(d.values())
    for b, w in d.items():
        ob.vertex_groups[b].add([n], w / tot, 'REPLACE')
ob.parent = rig
mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig

counts = np.bincount(region, minlength=len(REGIONS))
print({REGIONS[i]: int(c) for i, c in enumerate(counts)})
print('Höhe (m):', P[:, 1].ptp() * S if hasattr(P[:, 1], 'ptp') else np.ptp(P[:, 1]) * S)

bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', export_skins=True, export_animations=False,
                          export_materials='NONE', export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                          export_texcoords=False, export_normals=True, export_all_influences=False,
                          export_def_bones=False, export_yup=True)
print('exportiert', OUT)
