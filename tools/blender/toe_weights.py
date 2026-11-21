"""Zehen beweglich machen: Vertices vor dem Fußballen bekommen weich verlaufend Gewicht am Knochen toe.L/R.

Das MakeHuman-Skelett hat keine Zehen-Gewichte; ohne sie können die Zehen nicht abknicken und ragen auf dem
Fußballen (Liegestütz, Ausfallschritt, Laufen …) in den Boden. Wird von build_model.py und fix_body.py benutzt.
"""
from mathutils import Vector

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def add_toe_weights(ob, rig, start=-0.004, end=0.022):
    me = ob.data; vg = ob.vertex_groups; n = 0
    for s in 'LR':
        foot = rig.data.bones[f'foot.{s}']; toe = rig.data.bones[f'toe.{s}']
        H = rig.matrix_world @ toe.head_local; A = rig.matrix_world @ foot.head_local
        fwd = Vector((H.x - A.x, H.y - A.y, 0)).normalized()  # Fußrichtung waagrecht
        gF = vg[f'foot.{s}']; gT = vg.get(f'toe.{s}') or vg.new(name=f'toe.{s}')
        for v in me.vertices:
            p = ob.matrix_world @ v.co
            if p.z > A.z or (p - H).length > 0.16: continue  # nur unterhalb des Knöchels, in Fußnähe
            wf = next((g.weight for g in v.groups if g.group == gF.index), 0.0)
            if wf <= 0: continue
            w = smoothstep(start, end, (p - H).dot(fwd))
            if w <= 0: continue
            gT.add([v.index], wf * w, 'REPLACE'); gF.add([v.index], wf * (1 - w), 'REPLACE'); n += 1
    return n
