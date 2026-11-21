"""Iron Ladder – vorhandenes Körpermodell (3d/body.glb) in Blender nachbessern, ohne die MakeHuman-Quellen neu zu laden.

Aufruf (aus dem Repo-Ordner):  blender -b -P tools/blender/fix_body.py
Ausgabe: tools/3d/body.raw.glb  ->  danach  cd tools/3d && node build.mjs  (komprimiert nach 3d/body.glb)
Änderung: Zehen-Gewichte (toe_weights.py). Export wie in build_model.py.
"""
import pathlib, sys
import bpy
REPO = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'tools' / 'blender'))
from toe_weights import add_toe_weights

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(REPO / '3d' / 'body.glb'), bone_heuristic='BLENDER')
sc = bpy.context.scene
rig = next(o for o in sc.objects if o.type == 'ARMATURE')
body = next(o for o in rig.children if o.type == 'MESH')
for o in list(sc.objects):
    if o.type == 'MESH' and o.parent is None: bpy.data.objects.remove(o, do_unlink=True)
if 'toe.L' in body.vertex_groups and any(g.group == body.vertex_groups['toe.L'].index for v in body.data.vertices for g in v.groups):
    print('IRON_BODY Zehen-Gewichte schon vorhanden'); n = 0
else:
    n = add_toe_weights(body, rig)
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = rig
out = REPO / 'tools' / '3d' / 'body.raw.glb'
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_skins=True, export_animations=False,
                          export_materials='NONE', export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                          export_texcoords=False, export_normals=True, export_all_influences=False,
                          export_def_bones=False, export_yup=True, export_rest_position_armature=True)
print(f'IRON_BODY {n} Vertices mit Zehen-Gewicht, exportiert nach {out}')
