"""Iron Ladder – Beispielübung „Kurzhantel-Curl“, komplett in Blender gebaut und animiert.

Läuft im geöffneten Blender (Scripting-Tab oder per MCP):
    exec(open(r'<repo>/tools/blender/demo_curl.py', encoding='utf-8').read())
oder ohne Oberfläche:
    blender -b -P tools/blender/demo_curl.py

Legt die Szene 'IronLadder_Curl' an (andere Szenen bleiben unberührt), lädt 3d/body.glb,
baut eine detailliertere Kurzhantel, animiert einen Bizeps-Curl (Keyframes am Skelett, 2 s Schleife)
und exportiert 3d/demo/curl.glb (Figur + Hanteln + Animation 'curl'). Ansehen: 3d/demo/curl.html.
Blender-Koordinaten: z oben, Figur schaut nach -y.
"""
import math, pathlib
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion

try:
    REPO = pathlib.Path(__file__).resolve().parents[2]
except NameError:
    REPO = pathlib.Path(globals().get('IRON_REPO', '.')).resolve()
SCENE = 'IronLadder_Curl'
FPS, LOOP = 24, 48  # 2 s pro Wiederholung

# ---------------- Szene ----------------
def fresh_scene():
    old = bpy.data.scenes.get(SCENE)
    sc = bpy.data.scenes.new(SCENE + '_neu')
    if bpy.context.window: bpy.context.window.scene = sc
    if old:
        for o in list(old.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(old)
    sc.name = SCENE
    for blocks in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions, bpy.data.curves, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for b in list(blocks):
            if b.users == 0: blocks.remove(b)
    sc.render.fps = FPS; sc.frame_start = 1; sc.frame_end = LOOP
    sc.unit_settings.system = 'METRIC'
    return sc

def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob); return ob

# ---------------- Materialien ----------------
def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

def mat(name, hexcol, rough=0.5, metal=0.0, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(hexcol), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat: b.inputs['Coat Weight'].default_value = coat
    return m

def skin_material():
    """Figur wie in der App: helles Grau-Beige, Bizeps grün (Region 11), Unterarm/Schulter heller grün."""
    m = bpy.data.materials.new('Figur'); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links; N.clear()
    out = N.new('ShaderNodeOutputMaterial'); bsdf = N.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 0.6
    bsdf.inputs['Sheen Weight'].default_value = 0.3
    bsdf.inputs['Sheen Tint'].default_value = (*srgb('#ffe2d2'), 1)
    attr = N.new('ShaderNodeAttribute'); attr.attribute_name = 'hl'
    add2 = N.new('ShaderNodeMapRange'); add2.interpolation_type = 'SMOOTHSTEP'
    L.new(attr.outputs['Fac'], add2.inputs[0])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*srgb('#b4ada6'), 1); mix.inputs['B'].default_value = (*srgb('#00a86b'), 1)
    L.new(add2.outputs[0], mix.inputs['Factor']); L.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    L.new(bsdf.outputs[0], out.inputs[0])
    return m

# ---------------- Kurzhantel ----------------
def mesh_ob(name, bm, m, smooth=True, parent=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    ob = link(bpy.data.objects.new(name, me)); ob.data.materials.append(m)
    if parent: ob.parent = parent
    return ob

def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for md in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)

def lathe(name, prof, m, parent=None, seg=48, cap=True):
    """Rotationskörper um die lokale x-Achse: prof = [(x, r), …]"""
    bm = bmesh.new(); rings = []
    for (x, r) in prof:
        rings.append([bm.verts.new((x, r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg))) for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg; bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_ob(name, bm, m, True, parent)
    md = ob.modifiers.new('k', 'EDGE_SPLIT'); md.split_angle = math.radians(40); apply_mods(ob)
    return ob

def knurled_grip(name, x0, x1, r, m, parent, seg=64, depth=0.0006):
    """Griff mit echter Rändelung: Schachbrett aus Höhen/Tiefen ergibt diagonale Rauten (Pyramiden)."""
    pitch = 2 * math.pi * r / seg
    rows = max(2, round((x1 - x0) / pitch / 2) * 2)
    bm = bmesh.new(); grid = []
    for k in range(rows + 1):
        x = x0 + (x1 - x0) * k / rows; row = []
        edge = k == 0 or k == rows
        for i in range(seg):
            t = 2 * math.pi * i / seg
            rr = r if edge else r + (depth if (i + k) % 2 == 0 else -depth)
            row.append(bm.verts.new((x, rr * math.cos(t), rr * math.sin(t))))
        grid.append(row)
    for k in range(rows):
        a, b = grid[k], grid[k + 1]
        for i in range(seg):
            j = (i + 1) % seg
            # Dreiecke entlang der Diagonale, die durch die Spitzen läuft -> scharfe Rautenkanten
            if (i + k) % 2 == 0: bm.faces.new((a[i], a[j], b[j])); bm.faces.new((a[i], b[j], b[i]))
            else: bm.faces.new((a[i], a[j], b[i])); bm.faces.new((a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_ob(name, bm, m, False, parent)

def hex_head(name, xa, xb, R, m, parent, chamfer=0.012):
    """Sechskant-Kopf aus Gummi mit gebrochenen Kanten, Achse x von xa nach xb."""
    bm = bmesh.new(); rings = []
    for x in (xa, xb):
        rings.append([bm.verts.new((x, R * math.cos(math.pi / 6 + i * math.pi / 3), R * math.sin(math.pi / 6 + i * math.pi / 3))) for i in range(6)])
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[1])
    for i in range(6):
        j = (i + 1) % 6; bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_ob(name, bm, m, True, parent)
    bv = ob.modifiers.new('b', 'BEVEL'); bv.width = chamfer; bv.segments = 4; bv.profile = 0.6
    ws = ob.modifiers.new('n', 'WEIGHTED_NORMAL'); ws.keep_sharp = True
    apply_mods(ob); return ob

def label(text, x, side, parent, m, size=0.034):
    """Gewichtsangabe erhaben auf der Endkappe (Text -> Mesh)."""
    cu = bpy.data.curves.new('kg', 'FONT'); cu.body = text; cu.size = size; cu.extrude = 0.0009
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    ob = link(bpy.data.objects.new('gewicht', cu))
    # Spalten: Schreibrichtung, oben, Normale (zeigt von der Hantel weg)
    ob.matrix_world = Matrix(((0, 0, side, x), (side, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.convert(target='MESH'); ob = bpy.context.view_layer.objects.active; ob.select_set(False)
    ob.data.materials.clear(); ob.data.materials.append(m)
    ob.parent = parent; return ob

def dumbbell(name, M, kg='12.5'):
    """Ursprung = Griffmitte, Griffachse = lokale x-Achse (wie 3d/eq/dumbbell.glb)."""
    root = link(bpy.data.objects.new(name, None)); root.empty_display_size = 0.05
    grip, hl, R = 0.135, 0.095, 0.068
    knurled_grip('rändel', -grip / 2 + 0.012, grip / 2 - 0.012, 0.0162, M['knurl'], root)
    for s in (-1, 1):
        g0 = s * grip / 2
        # glatter Chromübergang + Bund
        lathe('bund', [(s * (grip / 2 - 0.014), 0.0158), (g0, 0.0158), (g0, 0.024), (g0 + s * 0.004, 0.027),
                       (g0 + s * 0.012, 0.027), (g0 + s * 0.014, 0.03)], M['chrome'], root, cap=False)
        a = g0 + s * 0.014; b = a + s * hl
        hex_head('kopf', min(a, b), max(a, b), R, M['rubber'], root)
        # grüner Akzentring (App-Farbe) und Stahl-Endkappe
        ra = a + s * 0.016; rb = ra + s * 0.007
        hex_head('akzent', min(ra, rb), max(ra, rb), R + 0.0012, M['accent'], root, chamfer=0.0025)
        e = b
        lathe('kappe', [(e - s * 0.002, 0.0), (e - s * 0.002, 0.044), (e + s * 0.002, 0.046), (e + s * 0.005, 0.044),
                        (e + s * 0.006, 0.0)], M['steel'], root, seg=64, cap=False)
        label(kg, e + s * 0.0062, s, root, M['chrome'])
    return root

# ---------------- Figur ----------------
def import_body():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(REPO / '3d' / 'body.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == 'MESH' and o.parent is None: bpy.data.objects.remove(o, do_unlink=True)  # Bone-Shape-Hilfsobjekt
    for c in list(bpy.data.collections):
        if c.name.startswith('glTF_not_exported') and not c.objects: bpy.data.collections.remove(c)
    rig = bpy.data.objects['Rig'] if 'Rig' in bpy.context.scene.objects else next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    body = next(o for o in rig.children if o.type == 'MESH')
    # Hervorhebung wie in der App (figure.js setHighlight): Haupt-/Nebenmuskel je Vertex, 3× mit Nachbarn geglättet
    me = body.data; col = me.attributes['Color'].data
    W = {11: 1.0, 13: 0.5, 8: 0.5}  # biceps, forearms, delt_front
    hl = [0.0] * len(me.vertices)
    for li, lp in enumerate(me.loops): hl[lp.vertex_index] = W.get(round(col[li].color[0] * 31), 0.0)
    nb = [[] for _ in me.vertices]
    for e in me.edges: a, b = e.vertices; nb[a].append(b); nb[b].append(a)
    for _ in range(3):
        hl = [0.5 * hl[i] + 0.5 * sum(hl[j] for j in nb[i]) / len(nb[i]) if nb[i] else hl[i] for i in range(len(hl))]
    reg = me.attributes.get('hl') or me.attributes.new('hl', 'FLOAT', 'POINT')
    reg.data.foreach_set('value', hl)
    body.data.materials.clear(); body.data.materials.append(skin_material())
    return rig, body

# ---------------- Studio ----------------
def studio():
    sc = bpy.context.scene
    w = bpy.data.worlds.new('Studio'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (*srgb('#e9e9ee'), 1); bg.inputs[1].default_value = 0.6
    def light(name, typ, loc, energy, size, color='#ffffff'):
        ld = bpy.data.lights.new(name, typ); ld.energy = energy; ld.color = srgb(color)
        if typ == 'AREA': ld.size = size
        ob = link(bpy.data.objects.new(name, ld)); ob.location = loc
        d = Vector((0, 0, 1.0)) - Vector(loc); ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); return ob
    light('Key', 'AREA', (2.0, -3.0, 3.6), 650, 2.0)
    light('Rim', 'AREA', (-2.6, 2.8, 2.6), 380, 2.5, '#e6eeff')
    light('Fill', 'AREA', (-3.0, -2.0, 1.2), 140, 3.0)
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=2.2, fill_type='NGON', location=(0, 0, 0))
    fl = bpy.context.active_object; fl.name = 'Boden'; fl.data.materials.append(mat('Boden', '#d8d8de', 0.92))
    cd = bpy.data.cameras.new('Kamera'); cd.lens = 55
    cam = link(bpy.data.objects.new('Kamera', cd)); cam.location = (2.35, -3.25, 1.45)
    cam.rotation_euler = (Vector((0, 0, 1.05)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam
    sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 900; sc.render.resolution_y = 1100
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'

# ---------------- Pose & Animation ----------------
ARM = ['upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02', 'wrist']
FINGERS = [f'finger{i}-{j}' for i in range(2, 6) for j in (1, 2, 3)]

def upd(): bpy.context.view_layer.update()

def rot_about(pb, R, P):
    """Pose-Knochen um Punkt P (Armature-Raum) mit Rotation R drehen."""
    pb.matrix = Matrix.Translation(P) @ R.to_matrix().to_4x4() @ Matrix.Translation(-P) @ pb.matrix; upd()

def chain(rig, s):
    pb = rig.pose.bones
    S = pb[f'upperarm01.{s}'].head.copy(); E = pb[f'lowerarm01.{s}'].head.copy(); W = pb[f'wrist.{s}'].head.copy()
    return S, E, W

def pose_arm(rig, s, flex, fwd=0.0, abd=0.10, twist=0.0, hand=0.0, grip=1.0, ext=0.0):
    """flex: Ellbogenbeugung in Grad (0 = gestreckt); fwd: Oberarm nach vorn (Grad);
    abd: Abspreizen (Grad-Anteil, 0.1 ≈ 6°); twist: Unterarm-Supination (Grad); hand: Handgelenk beugen (Grad)."""
    pb = rig.pose.bones; side = 1 if s == 'L' else -1
    for n in ARM + ['shoulder01'] + [f + '' for f in FINGERS]:
        b = pb[f'{n}.{s}']; b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = (1, 0, 0, 0)
    upd()
    # 1) Oberarm hängt (leicht abgespreizt, ggf. nach vorn)
    S, E, W = chain(rig, s)
    a = math.radians(fwd)
    d = Vector((side * abd, -math.sin(a), -math.cos(a))).normalized()
    rot_about(pb[f'upperarm01.{s}'], (E - S).rotation_difference(d), S)
    # 2) Oberarm um die eigene Achse drehen, bis die Beugeebene nach vorn zeigt
    S, E, W = chain(rig, s); u = (E - S).normalized(); f = (W - E).normalized()
    h = u.cross(f).normalized(); hs = u.cross(Vector((0, -1, 0))).normalized()
    ang = h.angle(hs); sgn = 1 if h.cross(hs).dot(u) > 0 else -1
    rot_about(pb[f'upperarm01.{s}'], Quaternion(u, sgn * ang + side * math.radians(ext)), S)
    # 3) Ellbogen beugen
    S, E, W = chain(rig, s); u = (E - S).normalized(); f = (W - E).normalized()
    n = u.cross(f).normalized(); cur = u.angle(f)
    rot_about(pb[f'lowerarm01.{s}'], Quaternion(n, math.radians(flex) - cur), E)
    # 4) Unterarm-Drehung (Supination) und Handgelenk
    S, E, W = chain(rig, s); f = (W - E).normalized()
    rot_about(pb[f'lowerarm02.{s}'], Quaternion(f, side * math.radians(twist)), E)
    if hand:
        S, E, W = chain(rig, s); u = (E - S).normalized(); f = (W - E).normalized(); n = u.cross(f).normalized()
        rot_about(pb[f'wrist.{s}'], Quaternion(n, math.radians(hand)), W)
    # 5) Faust um den Griff
    for fn in FINGERS:
        b = pb[f'{fn}.{s}']; j = int(fn[-1])
        b.rotation_quaternion = Quaternion((1, 0, 0), math.radians(grip * (55 if j == 1 else 70)))
    upd()

def attach(rig, s, db, depth=0.024, along=0.0, lat=0.022):
    """Hantel in die Faust legen: Griffachse = Knöchellinie, Mitte vor der Handfläche; dann an wrist.<s> hängen."""
    pb = rig.pose.bones; side = 1 if s == 'L' else -1
    k2 = pb[f'finger2-1.{s}'].head; k5 = pb[f'finger5-1.{s}'].head; w = pb[f'wrist.{s}'].head
    mid = (k2 + k5) / 2; x = (k5 - k2).normalized() * side; hd = (mid - w).normalized()
    n = x.cross(hd).normalized() * side  # Handflächen-Normale
    if n.dot(Vector((0, -1, 0))) < 0: n = -n  # in der Startpose zeigt die Handfläche nach vorn
    hd = n.cross(x).normalized()
    c = mid + n * depth + hd * along + x * side * lat
    Mw = rig.matrix_world @ Matrix(((x[0], hd[0], n[0], c[0]), (x[1], hd[1], n[1], c[1]), (x[2], hd[2], n[2], c[2]), (0, 0, 0, 1)))
    db.parent = rig; db.parent_type = 'BONE'; db.parent_bone = f'wrist.{s}'; upd()
    db.matrix_world = Mw; upd()

def key_arm(rig, s, frame):
    for n in ARM + FINGERS:
        rig.pose.bones[f'{n}.{s}'].keyframe_insert('rotation_quaternion', frame=frame)

BOTTOM = dict(flex=10, abd=0.20, fwd=0, twist=90, ext=0, grip=1.0)
TOP = dict(flex=120, abd=0.22, fwd=8, twist=80, ext=-15, grip=1.0)

def ease(t): return t * t * (3 - 2 * t)

def phase(f):
    """Frame -> 0 (unten) … 1 (oben): 0.6 s hoch, 0.25 s halten, 1 s ablassen, kurz unten."""
    t = (f - 1) / FPS
    if t < 0.6: return ease(t / 0.6)
    if t < 0.85: return 1.0
    if t < 1.85: return 1 - ease((t - 0.85) / 1.0)
    return 0.0

def animate(rig, dbs):
    rig.animation_data_create(); act = bpy.data.actions.new('curl'); rig.animation_data.action = act
    for f in range(1, LOOP + 1, 2):
        p = phase(f)
        for s in 'LR':
            kw = {k: BOTTOM[k] + (TOP[k] - BOTTOM[k]) * p for k in BOTTOM}
            pose_arm(rig, s, **kw); key_arm(rig, s, f)
    # Ende = Anfang, damit die Schleife nahtlos ist
    for s in 'LR': pose_arm(rig, s, **BOTTOM); key_arm(rig, s, LOOP + 1)
    bpy.context.scene.frame_end = LOOP
    bpy.context.scene.frame_set(1)

def export(rig, body, dbs, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [rig, body] + [c for d in dbs for c in [d] + list(d.children_recursive)]: o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_animations=True, export_skins=True, export_def_bones=False,
                              export_frame_range=False, export_anim_single_armature=True, export_force_sampling=True,
                              export_texcoords=False, export_normals=True, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
                              export_meshopt_compression_enable=True)
    return path

def build():
    fresh_scene()
    M = dict(chrome=mat('Chrom', '#e6e8eb', 0.1, 1.0), knurl=mat('Rändel', '#9a9ea4', 0.42, 1.0),
             steel=mat('Stahl', '#b9bdc2', 0.28, 1.0), rubber=mat('Gummi', '#1a1b1e', 0.78, 0.0, 0.05),
             accent=mat('Akzent', '#00a86b', 0.45))
    rig, body = import_body()
    studio()
    dbs = [dumbbell('hantel.L', M), dumbbell('hantel.R', M)]
    for s, d in zip('LR', dbs):
        pose_arm(rig, s, **BOTTOM); attach(rig, s, d, lat=0.035)
    animate(rig, dbs)
    out = export(rig, body, dbs, REPO / '3d' / 'demo' / 'curl.glb')
    return rig, body, dbs, out

if __name__ == '__main__' or globals().get('IRON_RUN'):
    RESULT = build()
