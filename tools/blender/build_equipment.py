"""Iron Ladder – Trainingsgeräte in Blender modellieren (prozedural) und als GLB exportieren.

Aufruf:  python3 tools/blender/build_equipment.py <ausgabe-ordner>
Koordinaten der App: y oben, z = Blickrichtung der Figur, x = links. Meter.
Jedes Gerät hat einen dokumentierten Ursprung; bewegliche Teile sind eigene Knoten,
die die App bewegt (z. B. 'stack', 'carriage', 'sled', 'arm', 'back', 'crank').
"""
import sys, math, pathlib
import bpy, bmesh
from mathutils import Vector, Matrix, Euler

OUT = pathlib.Path(sys.argv[-1]); OUT.mkdir(parents=True, exist_ok=True)

def A(x, y, z):  # App -> Blender
    return Vector((x, -z, y))

# ---------------- Materialien ----------------
MATS = {}
def mat(name, color, rough=0.5, metal=0.0, clearcoat=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if clearcoat and 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = clearcoat
    MATS[name] = m; return m

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

def M():
    return dict(
        frame=mat('Rahmen', srgb('#2a2c30'), 0.38, 0.25, 0.3),
        frame2=mat('Rahmen hell', srgb('#8d939b'), 0.35, 0.6),
        chrome=mat('Chrom', srgb('#e6e8eb'), 0.12, 1.0),
        steel=mat('Stahl', srgb('#b9bdc2'), 0.3, 1.0),
        knurl=mat('Rändel', srgb('#8f9399'), 0.55, 1.0),
        rubber=mat('Gummi', srgb('#16171a'), 0.85),
        bumper=mat('Bumper', srgb('#1b1c1f'), 0.7),
        vinyl=mat('Polster', srgb('#202124'), 0.55, 0.0, 0.15),
        stack=mat('Gewichtsplatte', srgb('#2e3034'), 0.45, 0.3),
        accent=mat('Akzent', srgb('#c9ced4'), 0.3, 0.8),
        wood=mat('Holz', srgb('#c9a678'), 0.68),
        grip=mat('Griff', srgb('#121314'), 0.75),
        mat=mat('Matte', srgb('#2b3a44'), 0.9),
        red=mat('Markierung', srgb('#d23a32'), 0.5),
    )

# ---------------- Geometrie-Helfer ----------------
COL = None
def new_scene():
    global COL
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()

def link(ob, parent=None, m=None):
    bpy.context.scene.collection.objects.link(ob)
    if m is not None:
        ob.data.materials.append(m)
    if parent is not None:
        ob.parent = parent
    return ob

def empty(name, pos=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None); e.location = A(*pos)
    link(e, parent); return e

def mesh_from_bm(bm, name, m, parent=None, smooth=True, bevel=0, bseg=2, sub=0):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); link(ob, None, m)
    for p in me.polygons: p.use_smooth = smooth
    if bevel:
        md = ob.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = bseg; md.limit_method = 'ANGLE'
        md.harden_normals = False
    if sub:
        md = ob.modifiers.new('s', 'SUBSURF'); md.levels = sub; md.render_levels = sub
    if bevel or sub:
        bpy.context.view_layer.objects.active = ob
        for md in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
    if smooth:
        md = ob.modifiers.new('kanten', 'EDGE_SPLIT'); md.split_angle = math.radians(32); md.use_edge_sharp = False
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=md.name)
    if parent is not None:
        ob.parent = parent
    return ob

def box(name, c, size, m, parent=None, bevel=0.004, bseg=2, rot=None, sub=0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, -v.co.z * sz, v.co.y * sy))  # App-Größe (x,y,z) -> Blender
    if rot is not None:
        R = Euler((rot[0], -rot[2], rot[1]), 'XYZ').to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=R, verts=bm.verts)
    bmesh.ops.translate(bm, vec=A(*c), verts=bm.verts)
    return mesh_from_bm(bm, name, m, parent, smooth=True, bevel=bevel, bseg=bseg, sub=sub)

def pad(name, c, size, m, parent=None, rot=None, r=None):
    """Polster mit stark abgerundeten Kanten"""
    r = r or min(size) * 0.42
    return box(name, c, size, m, parent, bevel=r, bseg=5, rot=rot)

def cyl(name, p1, p2, r, m, parent=None, seg=24, cap=True, bevel=0.0):
    p1 = A(*p1); p2 = A(*p2); d = p2 - p1; L = d.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=L)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.transform(bm, matrix=q.to_matrix().to_4x4(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(p1 + p2) / 2, verts=bm.verts)
    return mesh_from_bm(bm, name, m, parent, smooth=True, bevel=bevel, bseg=2)

def tube_box(name, p1, p2, s, m, parent=None):
    """Vierkantrohr s×s zwischen zwei Punkten (abgerundet)"""
    a = Vector(p1); b = Vector(p2); d = b - a; L = d.length
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * s, v.co.y * s, v.co.z * L))
    dd = A(*d) ; q = Vector((0, 0, 1)).rotation_difference(dd.normalized())
    bmesh.ops.transform(bm, matrix=q.to_matrix().to_4x4(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=A(*((a + b) / 2)), verts=bm.verts)
    return mesh_from_bm(bm, name, m, parent, smooth=True, bevel=s * 0.18, bseg=3)

def lathe(name, prof, m, parent=None, seg=48, axis='x', center=(0, 0, 0)):
    """Rotationskörper: prof = [(r, a), …] mit a entlang der Achse (App-Koordinaten)."""
    bm = bmesh.new(); rings = []
    for (r, a) in prof:
        ring = []
        for i in range(seg):
            t = 2 * math.pi * i / seg; c, s = math.cos(t) * r, math.sin(t) * r
            if axis == 'x': p = (a, c, s)
            elif axis == 'y': p = (c, a, s)
            else: p = (c, s, a)
            ring.append(bm.verts.new(A(p[0] + center[0], p[1] + center[1], p[2] + center[2])))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            try: bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(bm, name, m, parent, smooth=True)

def torus(name, c, R, r, m, parent=None, axis='x', seg=40, rseg=14, arc=2 * math.pi, a0=0.0):
    bm = bmesh.new(); rings = []
    n = seg if arc >= 2 * math.pi - 1e-6 else seg + 1
    for i in range(n):
        t = a0 + arc * i / seg
        ring = []
        for k in range(rseg):
            u = 2 * math.pi * k / rseg
            rr = R + r * math.cos(u); h = r * math.sin(u)
            if axis == 'x': p = (h, rr * math.cos(t), rr * math.sin(t))
            elif axis == 'y': p = (rr * math.cos(t), h, rr * math.sin(t))
            else: p = (rr * math.cos(t), rr * math.sin(t), h)
            ring.append(bm.verts.new(A(p[0] + c[0], p[1] + c[1], p[2] + c[2])))
        rings.append(ring)
    closed = n == seg
    for i in range(seg if closed else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(rseg):
            l = (k + 1) % rseg
            bm.faces.new((a[k], a[l], b[l], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(bm, name, m, parent, smooth=True)

def bent_tube(name, pts, r, m, parent=None, seg=16):
    """Rundrohr entlang Punkten (App-Koordinaten) mit weichen Biegungen"""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 4; cu.resolution_u = 10
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = A(*p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, cu); link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.convert(target='MESH'); ob = bpy.context.view_layer.objects.active
    ob.data.materials.clear(); ob.data.materials.append(m)
    for p in ob.data.polygons: p.use_smooth = True
    if parent is not None: ob.parent = parent
    ob.select_set(False)
    return ob

def export(name, root):
    bpy.ops.object.select_all(action='DESELECT')
    def sel(o):
        o.select_set(True)
        for c in o.children: sel(c)
    sel(root)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(OUT / f'{name}.glb'), export_format='GLB', use_selection=True,
                              export_materials='EXPORT', export_texcoords=False, export_normals=True,
                              export_animations=False, export_skins=False, export_yup=True, export_apply=True)
    print('exportiert', name)

# ---------------- Bauteile ----------------
def bumper_plate(name, x, parent, m, dia=0.45, thick=0.053, hub=0.0254, y=0.0, z=0.0):
    R = dia / 2; h = thick / 2
    prof = [(hub, -h + 0.002), (0.045, -h + 0.002), (0.05, -h + 0.006), (0.07, -h + 0.006), (0.075, -h + 0.012),
            (R - 0.03, -h + 0.012), (R - 0.018, -h), (R - 0.004, -h), (R, -h + 0.006), (R, h - 0.006), (R - 0.004, h),
            (R - 0.018, h), (R - 0.03, h - 0.012), (0.075, h - 0.012), (0.07, h - 0.006), (0.05, h - 0.006), (0.045, h - 0.002), (hub, h - 0.002), (hub, -h + 0.002)]
    pl = lathe(name, prof, m['bumper'], parent, seg=64, center=(x, y, z))
    hubm = lathe(name + '_nabe', [(hub, -h - 0.001), (0.046, -h - 0.001), (0.046, h + 0.001), (hub, h + 0.001), (hub, -h - 0.001)], m['steel'], parent, seg=48, center=(x, y, z))
    return pl

def olympic_bar(parent, m, length=2.2, sleeve=0.415, plates=((0.45, 0.053),)):
    half = length / 2; inner = half - sleeve
    cyl('schaft', (-inner + 0.03, 0, 0), (inner - 0.03, 0, 0), 0.014, m['steel'], parent, seg=20)
    for s in (-1, 1):
        cyl('rändel', (s * 0.08, 0, 0), (s * 0.42, 0, 0), 0.0143, m['knurl'], parent, seg=20)
        lathe('hülse', [(0.0, s * (inner - 0.03)), (0.016, s * (inner - 0.03)), (0.016, s * (inner - 0.005)), (0.039, s * (inner - 0.005)), (0.039, s * inner),
                        (0.026, s * inner), (0.025, s * (half - 0.004)), (0.022, s * half), (0.0, s * half)], m['chrome'], parent, seg=36)
        x = s * (inner + 0.004)
        for (dia, th) in plates:
            x += s * th / 2; bumper_plate('scheibe', x, parent, m, dia, th); x += s * th / 2
        lathe('verschluss', [(0.026, x), (0.042, x), (0.042, x + s * 0.03), (0.026, x + s * 0.03), (0.026, x)], m['grip'], parent, seg=32)

def dumbbell(parent, m, head=0.068, hl=0.095, grip=0.135):
    cyl('griff', (-grip / 2 - 0.01, 0, 0), (grip / 2 + 0.01, 0, 0), 0.0165, m['chrome'], parent, seg=20)
    cyl('rändel', (-grip / 2 + 0.01, 0, 0), (grip / 2 - 0.01, 0, 0), 0.0168, m['knurl'], parent, seg=20)
    for s in (-1, 1):
        x0 = s * (grip / 2 + 0.008)
        lathe('ring', [(0.0165, x0), (0.03, x0), (0.03, x0 + s * 0.012), (0.0165, x0 + s * 0.012)], m['chrome'], parent, seg=24)
        # Sechskant-Kopf
        bm = bmesh.new(); vs = []
        for end in (0, 1):
            ring = []
            for i in range(6):
                t = math.pi / 6 + i * math.pi / 3
                xx = x0 + s * (0.012 + end * hl)
                ring.append(bm.verts.new(A(xx, head * math.cos(t), head * math.sin(t))))
            vs.append(ring)
        bm.faces.new(vs[0][::-1] if s > 0 else vs[0]); bm.faces.new(vs[1] if s > 0 else vs[1][::-1])
        for i in range(6):
            j = (i + 1) % 6; bm.faces.new((vs[0][i], vs[0][j], vs[1][j], vs[1][i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh_from_bm(bm, 'kopf', m['bumper'], parent, smooth=False, bevel=0.009, bseg=3)

def kettlebell(parent, m):
    # Ursprung = Griffmitte; Kugel hängt nach unten
    prof = []
    import math as mm
    R = 0.105; cy = -0.16
    for i in range(0, 33):
        a = -mm.pi / 2 + mm.pi * i / 32
        r = R * mm.cos(a); y = cy + R * mm.sin(a)
        if y < cy - R * 0.86: r = max(r, 0.0); y = max(y, cy - R * 0.86)
        prof.append((max(r, 0.0001), y))
    prof = [(0.0, cy - R * 0.86)] + prof + [(0.0, cy + R)]
    lathe('kugel', prof, m['bumper'], parent, seg=48, axis='y')
    pts = [(-0.06, cy + 0.05, 0), (-0.065, -0.02, 0), (-0.03, 0.02, 0), (0.03, 0.02, 0), (0.065, -0.02, 0), (0.06, cy + 0.05, 0)]
    bent_tube('henkel', pts, 0.017, m['bumper'], parent)

# ---------------- Geräte ----------------
def build_all():
    # Langhantel (Ursprung Stangenmitte, Achse x)
    new_scene(); m = M(); r = empty('barbell'); olympic_bar(r, m); export('barbell', r)
    # Langhantel schwer (2 Scheiben je Seite, Kreuzheben)
    new_scene(); m = M(); r = empty('barbell2'); olympic_bar(r, m, plates=((0.45, 0.053), (0.45, 0.04))); export('barbell2', r)
    # SZ-Stange (Ursprung Mitte zwischen den Griffen, Achse x)
    new_scene(); m = M(); r = empty('ezbar')
    pts = [(-0.42, 0, 0), (-0.3, 0, 0), (-0.24, 0, 0.03), (-0.18, 0, -0.02), (-0.12, 0, 0.025), (-0.05, 0, 0), (0.05, 0, 0), (0.12, 0, 0.025), (0.18, 0, -0.02), (0.24, 0, 0.03), (0.3, 0, 0), (0.42, 0, 0)]
    bent_tube('stange', pts, 0.014, m['steel'], r)
    for s in (-1, 1):
        lathe('hülse', [(0.0, s * 0.4), (0.024, s * 0.4), (0.024, s * 0.6), (0.0, s * 0.6)], m['chrome'], r, seg=32)
        lathe('bund', [(0.024, s * 0.4), (0.036, s * 0.4), (0.036, s * 0.415), (0.024, s * 0.415)], m['chrome'], r, seg=32)
        bumper_plate('scheibe', s * 0.44, r, m, dia=0.3, thick=0.04, hub=0.0254)
    export('ezbar', r)
    new_scene(); m = M(); r = empty('dumbbell'); dumbbell(r, m); export('dumbbell', r)
    new_scene(); m = M(); r = empty('kettlebell'); kettlebell(r, m); export('kettlebell', r)

    # Flachbank: Ursprung Boden, Mitte; Polster oben y=0.43, z −0.62…0.58
    new_scene(); m = M(); r = empty('bench_flat')
    pad('polster', (0, 0.395, -0.02), (0.29, 0.07, 1.2), m['vinyl'], r, r=0.025)
    box('platte', (0, 0.357, -0.02), (0.25, 0.012, 1.1), m['frame'], r, bevel=0.003)
    tube_box('träger', (0, 0.32, -0.55), (0, 0.32, 0.5), 0.06, m['frame'], r)
    for z in (-0.5, 0.45):
        tube_box('stütze', (0, 0.02, z), (0, 0.32, z), 0.06, m['frame'], r)
        tube_box('fuß', (-0.26, 0.03, z), (0.26, 0.03, z), 0.06, m['frame'], r)
        for s in (-1, 1): box('kappe', (s * 0.27, 0.03, z), (0.03, 0.065, 0.065), m['rubber'], r, bevel=0.01)
    export('bench_flat', r)

    # Verstellbare Bank: Ursprung Boden unter dem Gelenk; Sitz nach +z; 'back' dreht um x (Winkel setzt die App)
    new_scene(); m = M(); r = empty('bench_adj')
    pad('sitz', (0, 0.43, 0.2), (0.3, 0.07, 0.36), m['vinyl'], r, r=0.025)
    box('sitzplatte', (0, 0.39, 0.2), (0.26, 0.012, 0.33), m['frame'], r)
    tube_box('träger', (0, 0.3, -0.6), (0, 0.3, 0.55), 0.065, m['frame'], r)
    for z in (-0.6, 0.5):
        tube_box('stütze', (0, 0.02, z), (0, 0.3, z), 0.065, m['frame'], r)
        tube_box('fuß', (-0.28, 0.03, z), (0.28, 0.03, z), 0.065, m['frame'], r)
        for s in (-1, 1): box('kappe', (s * 0.29, 0.03, z), (0.03, 0.07, 0.07), m['rubber'], r, bevel=0.01)
    tube_box('sitzstütze', (0, 0.3, 0.2), (0, 0.38, 0.2), 0.05, m['frame'], r)
    for i in range(6):
        cyl('leiter', (-0.04, 0.33, -0.15 - i * 0.07), (0.04, 0.33, -0.15 - i * 0.07), 0.009, m['steel'], r, seg=12)
    back = empty('back', (0, 0.43, 0.0), r)
    pad('lehne', (0, 0, -0.42), (0.3, 0.07, 0.82), m['vinyl'], back, r=0.025)
    box('lehnenplatte', (0, -0.04, -0.42), (0.26, 0.012, 0.8), m['frame'], back)
    tube_box('lehnenträger', (0, -0.08, -0.05), (0, -0.08, -0.7), 0.05, m['frame'], back)
    export('bench_adj', r)

    # Kabelturm: Ursprung Boden, Mitte Vorderkante der Säule; Säule nach −z.
    # 'carriage' (y = Höhe der Umlenkrolle, Rolle zeigt nach +z), 'stack' (oberer Teil des Gewichtsblocks, hebt sich)
    new_scene(); m = M(); r = empty('cable_tower')
    H = 2.25
    box('fußplatte', (0, 0.02, -0.25), (0.75, 0.04, 0.62), m['frame'], r, bevel=0.008)
    for x in (-0.26, 0.26):
        tube_box('pfosten', (x, 0.04, -0.06), (x, H, -0.06), 0.08, m['frame'], r)
        tube_box('pfosten hinten', (x, 0.04, -0.46), (x, H, -0.46), 0.06, m['frame'], r)
        tube_box('strebe', (x, H - 0.03, -0.46), (x, H - 0.03, -0.06), 0.06, m['frame'], r)
    tube_box('kopf', (-0.3, H, -0.26), (0.3, H, -0.26), 0.1, m['frame'], r)
    box('blende', (0, 1.25, -0.02), (0.44, 1.7, 0.01), m['frame2'], r, bevel=0.002)
    for x in (-0.12, 0.12): cyl('führung', (x, 0.08, -0.26), (x, H - 0.06, -0.26), 0.012, m['chrome'], r, seg=16)
    for i in range(6):
        box('platte', (0, 0.1 + i * 0.026, -0.26), (0.36, 0.024, 0.2), m['stack'], r, bevel=0.004)
    stack = empty('stack', (0, 0, 0), r)
    for i in range(6, 16):
        box('platte', (0, 0.1 + i * 0.026, -0.26), (0.36, 0.024, 0.2), m['stack'], stack, bevel=0.004)
    cyl('stange', (0, 0.5, -0.26), (0, 1.05, -0.26), 0.01, m['chrome'], stack, seg=12)
    box('kopfplatte', (0, 0.535, -0.26), (0.38, 0.03, 0.22), m['steel'], stack, bevel=0.005)
    cyl('stift', (0.0, 0.4, -0.15), (0.0, 0.4, -0.1), 0.006, m['red'], stack, seg=10)
    tube_box('schiene', (0, 0.15, 0.02), (0, H - 0.1, 0.02), 0.07, m['frame2'], r)
    for k in range(18):
        cyl('rastloch', (0.0, 0.3 + k * 0.1, 0.055), (0.0, 0.3 + k * 0.1, 0.06), 0.007, m['rubber'], r, seg=10)
    car = empty('carriage', (0, 1.0, 0.0), r)
    box('schlitten', (0, 0, 0.06), (0.13, 0.24, 0.09), m['frame'], car, bevel=0.012)
    cyl('griffknopf', (0.07, 0.05, 0.06), (0.11, 0.05, 0.06), 0.014, m['red'], car, seg=14)
    box('rollengehäuse', (0, -0.02, 0.14), (0.05, 0.12, 0.1), m['frame'], car, bevel=0.01)
    lathe('rolle', [(0.0, -0.014), (0.045, -0.014), (0.05, -0.008), (0.044, 0.0), (0.05, 0.008), (0.045, 0.014), (0.0, 0.014)], m['stack'], car, seg=32, center=(0, -0.02, 0.15))
    cyl('karabineröse', (0, -0.08, 0.2), (0, -0.07, 0.2), 0.012, m['steel'], car, seg=12)
    export('cable_tower', r)

    # Griffe (Ursprung = Griffmitte, Griffachse x, Kabel-Anschluss 'hook')
    new_scene(); m = M(); r = empty('dhandle')
    cyl('griff', (-0.065, 0, 0), (0.065, 0, 0), 0.016, m['grip'], r, seg=20)
    bent_tube('bügel', [(-0.075, 0, 0), (-0.06, 0.07, 0), (0, 0.11, 0), (0.06, 0.07, 0), (0.075, 0, 0)], 0.007, m['steel'], r)
    torus('öse', (0, 0.125, 0), 0.014, 0.004, m['steel'], r, axis='x')
    empty('hook', (0, 0.13, 0), r); export('dhandle', r)
    new_scene(); m = M(); r = empty('rope')  # Ursprung Mitte zwischen den Händen, Seil entlang x
    bent_tube('seil', [(-0.2, 0, 0), (-0.12, 0.04, 0), (-0.04, 0.09, 0), (0, 0.1, 0), (0.04, 0.09, 0), (0.12, 0.04, 0), (0.2, 0, 0)], 0.013, m['grip'], r)
    for s in (-1, 1): lathe('knauf', [(0.0, s * 0.2), (0.025, s * 0.205), (0.026, s * 0.23), (0.0, s * 0.24)], m['rubber'], r, seg=24)
    lathe('hülse', [(0.0, -0.025), (0.02, -0.025), (0.02, 0.025), (0.0, 0.025)], m['steel'], r, seg=20, axis='y', center=(0, 0.11, 0))
    empty('hook', (0, 0.14, 0), r); export('rope', r)
    new_scene(); m = M(); r = empty('sbar')  # gerade Kurzstange 0.5 m mit Drehgelenk
    cyl('stange', (-0.25, 0, 0), (0.25, 0, 0), 0.0145, m['chrome'], r, seg=20)
    for s in (-1, 1): cyl('gummi', (s * 0.05, 0, 0), (s * 0.22, 0, 0), 0.0165, m['grip'], r, seg=20)
    lathe('dreh', [(0.0, 0.0), (0.022, 0.0), (0.022, 0.06), (0.012, 0.07), (0.0, 0.08)], m['steel'], r, seg=20, axis='y')
    empty('hook', (0, 0.08, 0), r); export('sbar', r)
    new_scene(); m = M(); r = empty('latbar')  # Latzugstange 1.2 m, Enden abgewinkelt
    bent_tube('stange', [(-0.6, -0.07, 0), (-0.5, -0.02, 0), (-0.38, 0, 0), (0.38, 0, 0), (0.5, -0.02, 0), (0.6, -0.07, 0)], 0.0145, m['chrome'], r)
    for s in (-1, 1): bent_tube('gummi', [(s * 0.6, -0.07, 0), (s * 0.5, -0.02, 0), (s * 0.4, 0, 0)], 0.017, m['grip'], r)
    lathe('dreh', [(0.0, 0.0), (0.022, 0.0), (0.022, 0.06), (0.012, 0.07), (0.0, 0.08)], m['steel'], r, seg=20, axis='y')
    empty('hook', (0, 0.08, 0), r); export('latbar', r)

    # Latzug-Station: Ursprung Boden unter Sitzmitte; Sitz oben y=0.47, Oberschenkelpolster, Säule hinten (−z),
    # obere Rolle bei (0, 2.3, 0.12), Gewichtsblock 'stack'
    new_scene(); m = M(); r = empty('lat_machine')
    pad('sitz', (0, 0.44, 0.02), (0.36, 0.08, 0.36), m['vinyl'], r, r=0.03)
    tube_box('sitzrohr', (0, 0.05, 0.02), (0, 0.4, 0.02), 0.07, m['frame'], r)
    tube_box('basis', (0, 0.035, 0.45), (0, 0.035, -0.75), 0.07, m['frame'], r)
    tube_box('quer', (-0.35, 0.035, 0.45), (0.35, 0.035, 0.45), 0.07, m['frame'], r)
    tube_box('kniestütze', (0, 0.4, 0.2), (0, 0.72, 0.2), 0.06, m['frame'], r)
    for s in (-1, 1): lathe('beinrolle', [(0.0, s * 0.04), (0.05, s * 0.04), (0.055, s * 0.06), (0.055, s * 0.22), (0.05, s * 0.24), (0.0, s * 0.24)], m['vinyl'], r, seg=28, center=(0, 0.69, 0.2))
    cyl('rollenachse', (-0.04, 0.69, 0.2), (0.04, 0.69, 0.2), 0.012, m['steel'], r, seg=12)
    for x in (-0.25, 0.25):
        tube_box('säule', (x, 0.035, -0.62), (x, 2.38, -0.62), 0.08, m['frame'], r)
    tube_box('kopf', (-0.3, 2.38, -0.62), (0.3, 2.38, -0.62), 0.09, m['frame'], r)
    tube_box('ausleger', (0, 2.36, -0.62), (0, 2.36, 0.16), 0.09, m['frame'], r)
    lathe('rolle', [(0.0, -0.014), (0.045, -0.014), (0.05, -0.008), (0.044, 0.0), (0.05, 0.008), (0.045, 0.014), (0.0, 0.014)], m['stack'], r, seg=32, center=(0, 2.3, 0.12))
    box('rollenhalter', (0, 2.31, 0.12), (0.05, 0.1, 0.12), m['frame'], r, bevel=0.01)
    box('blende', (0, 1.2, -0.56), (0.44, 1.6, 0.01), m['frame2'], r)
    for x in (-0.12, 0.12): cyl('führung', (x, 0.08, -0.72), (x, 2.3, -0.72), 0.012, m['chrome'], r, seg=16)
    for i in range(6): box('platte', (0, 0.1 + i * 0.026, -0.72), (0.36, 0.024, 0.2), m['stack'], r, bevel=0.004)
    st = empty('stack', (0, 0, 0), r)
    for i in range(6, 18): box('platte', (0, 0.1 + i * 0.026, -0.72), (0.36, 0.024, 0.2), m['stack'], st, bevel=0.004)
    box('kopfplatte', (0, 0.585, -0.72), (0.38, 0.03, 0.22), m['steel'], st)
    export('lat_machine', r)

    # Rudern sitzend: Ursprung Boden unter Sitzmitte; Sitz y=0.42, Fußplatte vorn (+z), untere Rolle bei (0, 0.45, 1.12)
    new_scene(); m = M(); r = empty('row_machine')
    pad('sitz', (0, 0.4, 0.0), (0.34, 0.07, 0.45), m['vinyl'], r, r=0.025)
    tube_box('träger', (0, 0.3, -0.4), (0, 0.3, 1.25), 0.08, m['frame'], r)
    for z in (-0.35, 0.0): tube_box('stütze', (0, 0.03, z), (0, 0.3, z), 0.07, m['frame'], r)
    tube_box('fuß', (-0.3, 0.035, -0.35), (0.3, 0.035, -0.35), 0.07, m['frame'], r)
    for s in (-1, 1):
        box('fußplatte', (s * 0.13, 0.33, 0.88), (0.18, 0.32, 0.03), m['frame2'], r, bevel=0.005, rot=(math.radians(20), 0, 0))
        box('fußgummi', (s * 0.13, 0.33, 0.866), (0.16, 0.28, 0.01), m['rubber'], r, bevel=0.003, rot=(math.radians(20), 0, 0))
    for x in (-0.25, 0.25): tube_box('säule', (x, 0.035, 1.3), (x, 1.9, 1.3), 0.08, m['frame'], r)
    tube_box('kopf', (-0.3, 1.9, 1.3), (0.3, 1.9, 1.3), 0.09, m['frame'], r)
    lathe('rolle', [(0.0, -0.014), (0.045, -0.014), (0.05, -0.008), (0.044, 0.0), (0.05, 0.008), (0.045, 0.014), (0.0, 0.014)], m['stack'], r, seg=32, center=(0, 0.45, 1.12))
    box('rollenhalter', (0, 0.45, 1.16), (0.05, 0.1, 0.12), m['frame'], r, bevel=0.01)
    box('blende', (0, 1.0, 1.24), (0.44, 1.6, 0.01), m['frame2'], r)
    for x in (-0.12, 0.12): cyl('führung', (x, 0.08, 1.42), (x, 1.85, 1.42), 0.012, m['chrome'], r, seg=16)
    for i in range(6): box('platte', (0, 0.1 + i * 0.026, 1.42), (0.36, 0.024, 0.2), m['stack'], r, bevel=0.004)
    st = empty('stack', (0, 0, 0), r)
    for i in range(6, 16): box('platte', (0, 0.1 + i * 0.026, 1.42), (0.36, 0.024, 0.2), m['stack'], st, bevel=0.004)
    box('kopfplatte', (0, 0.535, 1.42), (0.38, 0.03, 0.22), m['steel'], st)
    export('row_machine', r)

    # Power Tower: Ursprung Boden, Mitte unter der Klimmzugstange (y=2.25, z=0); Dipgriffe y=1.22 bei x=±0.27, z 0…0.4
    new_scene(); m = M(); r = empty('power_tower')
    for x in (-0.48, 0.48):
        tube_box('pfosten', (x, 0.04, -0.28), (x, 2.32, -0.28), 0.075, m['frame'], r)
        tube_box('fuß', (x, 0.035, -0.75), (x, 0.035, 0.55), 0.07, m['frame'], r)
        box('kappe', (x, 0.035, 0.57), (0.07, 0.07, 0.03), m['rubber'], r, bevel=0.01)
        box('kappe', (x, 0.035, -0.77), (0.07, 0.07, 0.03), m['rubber'], r, bevel=0.01)
        tube_box('arm', (x, 2.25, -0.28), (x * 1.05, 2.25, 0.0), 0.06, m['frame'], r)
        tube_box('stütze', (x, 0.5, -0.28), (x, 0.035, -0.7), 0.06, m['frame'], r)
    tube_box('quer oben', (-0.5, 2.32, -0.28), (0.5, 2.32, -0.28), 0.07, m['frame'], r)
    cyl('klimmzugstange', (-0.62, 2.25, 0.0), (0.62, 2.25, 0.0), 0.016, m['chrome'], r, seg=20)
    for s in (-1, 1):
        cyl('griffschaum', (s * 0.62, 2.25, 0), (s * 0.5, 2.25, 0), 0.02, m['grip'], r, seg=18)
        tube_box('diphalter', (s * 0.48, 1.18, -0.28), (s * 0.27, 1.18, -0.05), 0.06, m['frame'], r)
        bent_tube('dipgriff', [(s * 0.27, 1.2, -0.06), (s * 0.27, 1.22, 0.1), (s * 0.27, 1.22, 0.38)], 0.016, m['steel'], r)
        cyl('dipschaum', (s * 0.27, 1.22, 0.12), (s * 0.27, 1.22, 0.4), 0.02, m['grip'], r, seg=18)
    pad('rückenpolster', (0, 1.15, -0.22), (0.32, 0.45, 0.06), m['vinyl'], r, r=0.025)
    pad('armpolster', (0.27, 1.32, -0.05), (0.08, 0.05, 0.24), m['vinyl'], r, r=0.02)
    pad('armpolster', (-0.27, 1.32, -0.05), (0.08, 0.05, 0.24), m['vinyl'], r, r=0.02)
    export('power_tower', r)

    # Beinpresse 45°: Ursprung Boden unter dem Sitzknick. Schlitten 'sled' (Ursprung = Mitte der Fußplatte) bewegt sich
    # entlang der Schiene (0, sin45, cos45); Grundstellung: Fußplatte bei (0, 0.95, 0.75)
    new_scene(); m = M(); r = empty('leg_press')
    c45 = math.cos(math.radians(45)); s45 = math.sin(math.radians(45))
    box('basis', (0, 0.04, 0.45), (0.9, 0.08, 2.0), m['frame'], r, bevel=0.01)
    pad('sitz', (0, 0.42, -0.08), (0.42, 0.08, 0.4), m['vinyl'], r, r=0.03)
    pad('lehne', (0, 0.62, -0.42), (0.42, 0.08, 0.7), m['vinyl'], r, rot=(math.radians(52), 0, 0), r=0.03)
    tube_box('sitzstütze', (0, 0.08, -0.1), (0, 0.38, -0.1), 0.09, m['frame'], r)
    tube_box('lehnenstütze', (0, 0.08, -0.62), (0, 0.78, -0.62), 0.08, m['frame'], r)
    for s in (-1, 1):
        cyl('haltegriff', (s * 0.27, 0.42, 0.05), (s * 0.27, 0.42, -0.2), 0.016, m['grip'], r, seg=16)
        tube_box('griffstütze', (s * 0.27, 0.08, -0.1), (s * 0.27, 0.42, -0.1), 0.05, m['frame'], r)
        tube_box('schiene', (s * 0.32, 0.35, 0.3), (s * 0.32, 0.35 + 1.6 * s45, 0.3 + 1.6 * c45), 0.07, m['frame2'], r)
        tube_box('schienenstütze', (s * 0.32, 0.08, 1.35), (s * 0.32, 0.35 + 1.05 * s45, 0.3 + 1.05 * c45), 0.08, m['frame'], r)
        tube_box('schienenfuß', (s * 0.32, 0.08, 0.3), (s * 0.32, 0.35, 0.3), 0.08, m['frame'], r)
    sled = empty('sled', (0, 0.95, 0.75), r)
    R45 = (math.radians(45), 0, 0)
    box('fußplatte', (0, 0.0, 0.0), (0.66, 0.62, 0.03), m['frame2'], sled, bevel=0.006, rot=R45)
    box('trittfläche', (0, -0.012, -0.012), (0.62, 0.58, 0.008), m['rubber'], sled, bevel=0.002, rot=R45)
    box('schlittenrahmen', (0, 0.06, 0.06), (0.75, 0.5, 0.08), m['frame'], sled, bevel=0.012, rot=R45)
    for s in (-1, 1):
        cyl('hantelaufnahme', (s * 0.38, 0.1, 0.1), (s * 0.58, 0.1, 0.1), 0.025, m['chrome'], sled, seg=20)
        bumper_plate('scheibe', s * 0.47, sled, m, dia=0.45, thick=0.05, y=0.1, z=0.1)
    export('leg_press', r)

    # Beinstrecker: Ursprung Boden unter Sitzmitte; Sitz y=0.5; Hebel 'arm' dreht um x durch Kniepunkt (0, 0.52, 0.27),
    # Rolle in Ruhe bei (0, 0.12, 0.33) (vor dem Schienbein)
    new_scene(); m = M(); r = empty('leg_ext')
    pad('sitz', (0, 0.47, 0.0), (0.4, 0.08, 0.46), m['vinyl'], r, r=0.03)
    pad('lehne', (0, 0.82, -0.25), (0.4, 0.62, 0.08), m['vinyl'], r, rot=(math.radians(-12), 0, 0), r=0.03)
    tube_box('sitzstütze', (0, 0.04, 0.0), (0, 0.43, 0.0), 0.09, m['frame'], r)
    tube_box('basis', (0, 0.035, -0.5), (0, 0.035, 0.45), 0.08, m['frame'], r)
    tube_box('quer', (-0.3, 0.035, -0.45), (0.3, 0.035, -0.45), 0.07, m['frame'], r)
    tube_box('lehnenstütze', (0, 0.04, -0.33), (0, 1.0, -0.33), 0.08, m['frame'], r)
    tube_box('turm', (0.42, 0.04, -0.3), (0.42, 1.25, -0.3), 0.09, m['frame'], r)
    box('stapel', (0.42, 0.45, -0.3), (0.2, 0.7, 0.26), m['stack'], r, bevel=0.006)
    for s in (-1, 1): cyl('haltegriff', (s * 0.26, 0.45, 0.15), (s * 0.26, 0.45, -0.1), 0.016, m['grip'], r, seg=16)
    tube_box('achshalter', (0.3, 0.52, 0.27), (0.3, 0.43, 0.15), 0.06, m['frame'], r)
    arm = empty('arm', (0, 0.52, 0.27), r)
    lathe('nabe', [(0.0, 0.2), (0.05, 0.2), (0.05, 0.3), (0.0, 0.3)], m['frame2'], arm, seg=24)
    tube_box('hebel', (0.25, 0.0, 0.0), (0.25, -0.42, 0.05), 0.05, m['frame'], arm)
    tube_box('rollenarm', (0.25, -0.4, 0.06), (0.0, -0.4, 0.06), 0.045, m['frame'], arm)
    lathe('rolle', [(0.0, -0.2), (0.05, -0.2), (0.055, -0.18), (0.055, 0.18), (0.05, 0.2), (0.0, 0.2)], m['vinyl'], arm, seg=28, center=(0, -0.4, 0.06))
    export('leg_ext', r)

    # Beinbeuger liegend: Ursprung Boden unter Bankmitte; Polster y=0.6 (Hüftbuckel), Hebel 'arm' dreht um Kniepunkt (0, 0.62, -0.42),
    # Rolle in Ruhe hinter den Fersen bei (0, 0.62+0.06, -0.85)
    new_scene(); m = M(); r = empty('leg_curl')
    pad('bauch', (0, 0.58, 0.32), (0.34, 0.08, 0.6), m['vinyl'], r, r=0.03)
    pad('hüfte', (0, 0.6, -0.12), (0.34, 0.12, 0.3), m['vinyl'], r, r=0.045)
    pad('oberschenkel', (0, 0.56, -0.36), (0.34, 0.08, 0.22), m['vinyl'], r, r=0.03)
    tube_box('träger', (0, 0.48, -0.5), (0, 0.48, 0.65), 0.08, m['frame'], r)
    for z in (-0.4, 0.55):
        tube_box('stütze', (0, 0.03, z), (0, 0.48, z), 0.08, m['frame'], r)
        tube_box('fuß', (-0.3, 0.035, z), (0.3, 0.035, z), 0.07, m['frame'], r)
    for s in (-1, 1): cyl('haltegriff', (s * 0.22, 0.52, 0.62), (s * 0.22, 0.6, 0.72), 0.016, m['grip'], r, seg=16)
    tube_box('achshalter', (0.28, 0.48, -0.42), (0.28, 0.62, -0.42), 0.06, m['frame'], r)
    arm = empty('arm', (0, 0.62, -0.42), r)
    lathe('nabe', [(0.0, 0.22), (0.05, 0.22), (0.05, 0.3), (0.0, 0.3)], m['frame2'], arm, seg=24)
    tube_box('hebel', (0.26, 0.0, 0.0), (0.26, 0.06, -0.44), 0.05, m['frame'], arm)
    tube_box('rollenarm', (0.26, 0.06, -0.43), (0.0, 0.06, -0.43), 0.045, m['frame'], arm)
    lathe('rolle', [(0.0, -0.2), (0.05, -0.2), (0.055, -0.18), (0.055, 0.18), (0.05, 0.2), (0.0, 0.2)], m['vinyl'], arm, seg=28, center=(0, 0.06, -0.43))
    export('leg_curl', r)

    # Multipresse (Smith): Ursprung Boden, Mitte unter der Stange (z=0); Stange 'bar' gleitet in y (Ruhe y=1.0)
    new_scene(); m = M(); r = empty('smith')
    for x in (-0.98, 0.98):
        tube_box('pfosten', (x, 0.04, 0.0), (x, 2.2, 0.0), 0.08, m['frame'], r)
        tube_box('pfosten hinten', (x, 0.04, -0.6), (x, 2.2, -0.6), 0.08, m['frame'], r)
        tube_box('fuß', (x, 0.035, -0.75), (x, 0.035, 0.45), 0.08, m['frame'], r)
        tube_box('oben', (x, 2.2, -0.6), (x, 2.2, 0.0), 0.08, m['frame'], r)
        cyl('führung', (x * 0.93, 0.1, 0.06), (x * 0.93, 2.15, 0.06), 0.015, m['chrome'], r, seg=16)
        for k in range(10): cyl('haken', (x * 0.93, 0.45 + k * 0.17, 0.0), (x * 0.93, 0.45 + k * 0.17, 0.04), 0.008, m['steel'], r, seg=10)
    tube_box('quer oben', (-1.0, 2.2, 0.0), (1.0, 2.2, 0.0), 0.08, m['frame'], r)
    tube_box('quer unten', (-1.0, 0.035, -0.75), (1.0, 0.035, -0.75), 0.08, m['frame'], r)
    bar = empty('bar', (0, 1.0, 0.0), r)
    olympic_bar(bar, m, length=2.15, sleeve=0.32)
    for s in (-1, 1):
        box('läufer', (s * 0.91, 0, 0.06), (0.06, 0.12, 0.06), m['frame2'], bar, bevel=0.008)
        box('haken', (s * 0.86, 0, 0.03), (0.03, 0.03, 0.06), m['steel'], bar, bevel=0.004)
    export('smith', r)

    # Hyperextension 45°: Ursprung Boden; Hüftpolster-Oberkante bei (0, 0.98, 0.1); Fußplatte bei (0, 0.06, -0.62)
    new_scene(); m = M(); r = empty('hyper')
    tube_box('basis', (0, 0.035, -0.85), (0, 0.035, 0.45), 0.08, m['frame'], r)
    tube_box('quer', (-0.3, 0.035, 0.45), (0.3, 0.035, 0.45), 0.07, m['frame'], r)
    tube_box('quer2', (-0.3, 0.035, -0.85), (0.3, 0.035, -0.85), 0.07, m['frame'], r)
    tube_box('schräge', (0, 0.07, -0.8), (0, 0.92, 0.05), 0.08, m['frame'], r)
    tube_box('stütze', (0, 0.07, 0.35), (0, 0.85, 0.08), 0.07, m['frame'], r)
    pad('hüftpolster', (0, 0.9, 0.1), (0.42, 0.1, 0.3), m['vinyl'], r, rot=(math.radians(45), 0, 0), r=0.045)
    box('fußplatte', (0, 0.37, -0.43), (0.4, 0.25, 0.02), m['frame2'], r, rot=(math.radians(-45), 0, 0))
    tube_box('plattenhalter', (0, 0.07, -0.6), (0, 0.33, -0.46), 0.05, m['frame'], r)
    for zz, yy in ((-0.5, 0.3), (-0.56, 0.18)):
        pass
    lathe('fersenrolle', [(0.0, -0.18), (0.045, -0.18), (0.05, -0.16), (0.05, 0.16), (0.045, 0.18), (0.0, 0.18)], m['vinyl'], r, seg=24, center=(0, 0.54, -0.29))
    tube_box('rollenhalter', (0, 0.45, -0.39), (0, 0.54, -0.29), 0.04, m['frame'], r)
    export('hyper', r)

    # Plyo-Box (0.6 × 0.5 × 0.45), Ursprung Boden-Mitte
    new_scene(); m = M(); r = empty('box')
    box('box', (0, 0.225, 0), (0.6, 0.45, 0.5), m['wood'], r, bevel=0.012, bseg=3)
    for s in (-1, 1): box('griffloch', (s * 0.3, 0.33, 0), (0.012, 0.05, 0.16), m['frame'], r, bevel=0.01)
    export('box', r)
    # Stufe für Wadenheben (0.5 × 0.25 × 0.08), Ursprung Boden-Mitte
    new_scene(); m = M(); r = empty('step')
    box('stufe', (0, 0.045, 0), (0.55, 0.09, 0.26), m['rubber'], r, bevel=0.012, bseg=3)
    box('platte', (0, 0.092, 0), (0.5, 0.006, 0.22), m['frame'], r, bevel=0.002)
    export('step', r)
    # Gymnastikmatte 0.6 × 1.8, Ursprung Boden-Mitte
    new_scene(); m = M(); r = empty('mat')
    box('matte', (0, 0.005, 0), (0.62, 0.01, 1.85), m['mat'], r, bevel=0.004)
    export('mat', r)
    # Kniebank für Nordic Curls: Polster 0.6 lang, Fersenhalter hinten; Ursprung Boden-Mitte des Polsters
    new_scene(); m = M(); r = empty('nordic')
    pad('kniepolster', (0, 0.06, 0), (0.45, 0.09, 0.62), m['vinyl'], r, r=0.035)
    box('platte', (0, 0.01, -0.05), (0.5, 0.02, 0.85), m['frame'], r)
    tube_box('halter', (0, 0.02, -0.42), (0, 0.2, -0.42), 0.05, m['frame'], r)
    lathe('fersenrolle', [(0.0, -0.18), (0.04, -0.18), (0.045, -0.16), (0.045, 0.16), (0.04, 0.18), (0.0, 0.18)], m['vinyl'], r, seg=24, center=(0, 0.17, -0.42))
    export('nordic', r)
    # Ab Wheel: Ursprung Radmitte, Achse x
    new_scene(); m = M(); r = empty('abwheel')
    lathe('rad', [(0.0, -0.03), (0.075, -0.03), (0.09, -0.02), (0.092, 0.0), (0.09, 0.02), (0.075, 0.03), (0.0, 0.03)], m['rubber'], r, seg=48)
    lathe('felge', [(0.0, -0.032), (0.05, -0.032), (0.05, 0.032), (0.0, 0.032)], m['frame2'], r, seg=32)
    cyl('achse', (-0.18, 0, 0), (0.18, 0, 0), 0.008, m['steel'], r, seg=12)
    for s in (-1, 1): cyl('griff', (s * 0.07, 0, 0), (s * 0.17, 0, 0), 0.017, m['grip'], r, seg=18)
    export('abwheel', r)

    # Ergometer: Ursprung Boden unter Tretlager; Tretlager (0, 0.3, 0); Sattel-Oberkante (0, 0.92, -0.32); Lenker (0, 1.05, 0.38)
    # 'crank' dreht um x; Pedalachsen bei Radius 0.17
    new_scene(); m = M(); r = empty('bike')
    tube_box('basis', (0, 0.035, -0.55), (0, 0.035, 0.6), 0.07, m['frame'], r)
    for z in (-0.55, 0.6): tube_box('fuß', (-0.26, 0.035, z), (0.26, 0.035, z), 0.07, m['frame'], r)
    tube_box('sattelrohr', (0, 0.06, -0.12), (0, 0.85, -0.3), 0.07, m['frame'], r)
    tube_box('lenkerrohr', (0, 0.06, 0.3), (0, 1.0, 0.36), 0.07, m['frame'], r)
    tube_box('oberrohr', (0, 0.62, -0.22), (0, 0.8, 0.33), 0.06, m['frame'], r)
    pad('sattel', (0, 0.9, -0.32), (0.18, 0.06, 0.26), m['vinyl'], r, r=0.025)
    bent_tube('lenker', [(-0.25, 1.08, 0.4), (-0.2, 1.04, 0.36), (0, 1.02, 0.36), (0.2, 1.04, 0.36), (0.25, 1.08, 0.4)], 0.015, m['grip'], r)
    lathe('schwungrad', [(0.0, -0.035), (0.24, -0.035), (0.25, -0.02), (0.25, 0.02), (0.24, 0.035), (0.0, 0.035)], m['frame2'], r, seg=48, center=(0, 0.42, 0.3))
    lathe('abdeckung', [(0.0, -0.05), (0.27, -0.05), (0.28, -0.04), (0.28, 0.04), (0.27, 0.05), (0.0, 0.05)], m['frame'], r, seg=48, center=(0, 0.42, 0.3))
    crank = empty('crank', (0, 0.3, 0.0), r)
    lathe('kettenblatt', [(0.0, -0.06), (0.09, -0.06), (0.09, -0.05), (0.0, -0.05)], m['steel'], crank, seg=32)
    for s in (-1, 1):
        tube_box('kurbel', (s * 0.08, 0, 0), (s * 0.08, -0.17 * s, 0), 0.025, m['steel'], crank)
        cyl('pedalachse', (s * 0.08, -0.17 * s, 0), (s * 0.12, -0.17 * s, 0), 0.008, m['steel'], crank, seg=10)
        box('pedal', (s * 0.15, -0.17 * s, 0), (0.07, 0.02, 0.1), m['rubber'], crank, bevel=0.006)
    export('bike', r)

    # Abduktoren-Maschine: Ursprung Boden unter Sitzmitte; Sitz y=0.48; Beinpolster 'padL'/'padR' drehen um y bei (±0.14, 0.5, 0.15)
    new_scene(); m = M(); r = empty('abductor')
    pad('sitz', (0, 0.45, 0.02), (0.42, 0.08, 0.42), m['vinyl'], r, r=0.03)
    pad('lehne', (0, 0.83, -0.24), (0.42, 0.62, 0.08), m['vinyl'], r, rot=(math.radians(-15), 0, 0), r=0.03)
    tube_box('sitzstütze', (0, 0.04, 0), (0, 0.41, 0), 0.09, m['frame'], r)
    tube_box('basis', (0, 0.035, -0.5), (0, 0.035, 0.6), 0.08, m['frame'], r)
    tube_box('quer', (-0.4, 0.035, 0.55), (0.4, 0.035, 0.55), 0.07, m['frame'], r)
    tube_box('lehnenstütze', (0, 0.04, -0.33), (0, 1.0, -0.33), 0.08, m['frame'], r)
    for s in (-1, 1):
        cyl('haltegriff', (s * 0.25, 0.48, 0.1), (s * 0.25, 0.48, -0.15), 0.016, m['grip'], r, seg=16)
        tube_box('fußstütze', (s * 0.12, 0.04, 0.55), (s * 0.12, 0.18, 0.6), 0.05, m['frame'], r)
        box('fußraste', (s * 0.12, 0.2, 0.62), (0.14, 0.02, 0.12), m['rubber'], r, bevel=0.005)
        p = empty('padL' if s > 0 else 'padR', (s * 0.14, 0.5, 0.0), r)
        tube_box('arm', (0, -0.42, 0.0), (0, -0.42, 0.32), 0.045, m['frame'], p)
        tube_box('drehachse', (0, -0.42, 0.0), (0, -0.05, 0.0), 0.05, m['frame2'], p)
        pad('knieplster', (s * 0.07, 0.0, 0.32), (0.06, 0.18, 0.2), m['vinyl'], p, r=0.025)
        tube_box('padhalter', (0, -0.42, 0.32), (s * 0.05, 0.0, 0.32), 0.04, m['frame'], p)
    export('abductor', r)

    # Kniebeugen-Rack: Ursprung Boden, Mitte; Ablagen (J-Hooks) bei y=1.32, Pfosten bei x=±0.62, z=±0.3; Sicherheitsablagen y=0.62
    new_scene(); m = M(); r = empty('squat_rack')
    for x in (-0.62, 0.62):
        for z in (-0.3, 0.3):
            tube_box('pfosten', (x, 0.04, z), (x, 2.1, z), 0.075, m['frame'], r)
            for k in range(22): cyl('loch', (x, 0.35 + k * 0.075, z + 0.037), (x, 0.35 + k * 0.075, z + 0.04), 0.009, m['rubber'], r, seg=10)
        tube_box('fuß', (x, 0.035, -0.55), (x, 0.035, 0.55), 0.075, m['frame'], r)
        tube_box('oben', (x, 2.1, -0.3), (x, 2.1, 0.3), 0.075, m['frame'], r)
        box('jhook', (x * 0.94, 1.32, 0.33), (0.06, 0.05, 0.1), m['frame2'], r, bevel=0.008)
        box('jhook lippe', (x * 0.94, 1.36, 0.37), (0.06, 0.06, 0.02), m['rubber'], r, bevel=0.006)
        tube_box('sicherung', (x * 0.94, 0.62, -0.32), (x * 0.94, 0.62, 0.62), 0.05, m['frame2'], r)
    tube_box('quer oben', (-0.64, 2.1, -0.3), (0.64, 2.1, -0.3), 0.075, m['frame'], r)
    tube_box('quer hinten', (-0.64, 0.035, -0.55), (0.64, 0.035, -0.55), 0.075, m['frame'], r)
    export('squat_rack', r)

    # Maschinen-Sitzstation: Ursprung Boden unter Sitzmitte; Sitz y=0.48, Lehne hinten (verstellbar über 'back', Drehpunkt (0,0.5,-0.2)),
    # Gewichtsturm rechts hinten. Hebel zu den Griffen zeichnet die App.
    new_scene(); m = M(); r = empty('machine_seat')
    pad('sitz', (0, 0.45, 0.02), (0.4, 0.08, 0.4), m['vinyl'], r, r=0.03)
    tube_box('sitzrohr', (0, 0.04, 0.0), (0, 0.41, 0.0), 0.09, m['frame'], r)
    tube_box('basis', (0, 0.035, -0.55), (0, 0.035, 0.45), 0.08, m['frame'], r)
    tube_box('quer', (-0.35, 0.035, 0.45), (0.35, 0.035, 0.45), 0.07, m['frame'], r)
    tube_box('quer2', (-0.75, 0.035, -0.55), (0.35, 0.035, -0.55), 0.08, m['frame'], r)
    back = empty('back', (0, 0.5, -0.2), r)
    pad('lehne', (0, 0.36, -0.03), (0.4, 0.66, 0.08), m['vinyl'], back, r=0.03)
    tube_box('lehnenrohr', (0, 0.0, -0.09), (0, 0.72, -0.09), 0.07, m['frame'], back)
    tube_box('lehnenstütze', (0, 0.04, -0.33), (0, 0.55, -0.3), 0.08, m['frame'], r)
    for x in (-0.58, -0.92):
        tube_box('turm', (x, 0.04, -0.4), (x, 1.95, -0.4), 0.08, m['frame'], r)
    tube_box('turm oben', (-0.95, 1.95, -0.4), (0.0, 1.95, -0.4), 0.08, m['frame'], r)
    tube_box('turm quer', (0.0, 1.95, -0.4), (0.0, 1.0, -0.36), 0.07, m['frame'], r)
    box('blende', (-0.75, 1.0, -0.33), (0.3, 1.5, 0.01), m['frame2'], r)
    for i in range(16): box('platte', (-0.75, 0.1 + i * 0.026, -0.42), (0.26, 0.024, 0.18), m['stack'], r, bevel=0.004)
    for s in (-1, 1): cyl('haltegriff', (s * 0.24, 0.47, 0.18), (s * 0.24, 0.47, -0.08), 0.016, m['grip'], r, seg=16)
    export('machine_seat', r)

build_all()
