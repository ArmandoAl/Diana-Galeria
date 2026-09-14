"""Escalinata MUNAL, Blender 4.x+. Requiere create_hall.py en esta carpeta.

Scripting > Open > Run Script crea una escena independiente.
CLI: blender -b --python-exit-code 1 --python scripts/create_staircase.py --
     --output assets/staircase [--render]
"""
import argparse
from math import cos, sin, pi, isclose
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from create_hall import box, material, mesh_object

# Metros. La huella se mide como arco en la línea central de cada tramo.
STEPS, TREAD, RISE = 14, .32, .17
LANDING_Z, LANDING_WIDTH, LANDING_DEPTH = 2.50, 3.20, 2.60
FLIGHT_WIDTH, TURN, RAIL_HEIGHT = 1.80, pi / 2, 1.10
BASE_Z = LANDING_Z - STEPS * RISE  # Arranque común de 0.12 m.
RADIUS = STEPS * TREAD / TURN
ARC_SEGMENTS = 4  # Segmentos por huella, 56 por cuarto de círculo.


def path(side, radius, t, z):
    angle = TURN * t
    return Vector((side * (LANDING_WIDTH / 2 + radius * cos(angle)),
                   -RADIUS + radius * sin(angle), z))


def clean_mesh(obj):
    """Normales exteriores y eliminación de N-gons, incluidas tapas de tubos."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def marble_uv(obj):
    # Proyección por cara en metros: huellas XY; peraltes según eje dominante.
    uv = obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        axes = (0, 1) if abs(face.normal.z) > .5 else (
            (1, 2) if abs(face.normal.x) > abs(face.normal.y) else (0, 2))
        for index in face.loop_indices:
            co = obj.data.vertices[obj.data.loops[index].vertex_index].co
            uv.data[index].uv = (co[axes[0]], co[axes[1]])


def tread(side, step, collection, marble):
    vertices, faces = [], []
    top = BASE_Z + (step + 1) * RISE
    for i in range(ARC_SEGMENTS + 1):
        t = (step + i / ARC_SEGMENTS) / STEPS
        for radius, z in [(RADIUS-FLIGHT_WIDTH/2, BASE_Z),
                          (RADIUS+FLIGHT_WIDTH/2, BASE_Z),
                          (RADIUS+FLIGHT_WIDTH/2, top),
                          (RADIUS-FLIGHT_WIDTH/2, top)]:
            vertices.append(path(side, radius, t, z))
    faces.append((3, 2, 1, 0))
    for i in range(ARC_SEGMENTS):
        a = i * 4
        for j in range(4):
            k = (j + 1) % 4
            faces.append((a+j, a+k, a+k+4, a+j+4))
    a = ARC_SEGMENTS * 4
    faces.append((a, a+1, a+2, a+3))
    obj = mesh_object(f'Step_{"L" if side < 0 else "R"}_{step+1:02d}',
                      vertices, faces, collection, marble)
    obj['step_index'], obj['side'] = step + 1, side
    clean_mesh(obj)
    marble_uv(obj)
    return obj


def tube(name, points, radius, collection, iron, guides=None):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth, curve.bevel_resolution = radius, 2
    curve.use_fill_caps = True
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1)
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    bpy.context.view_layer.update()
    mesh = bpy.data.meshes.new_from_object(
        obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    result = bpy.data.objects.new(name + '_Mesh', mesh)
    collection.objects.link(result)
    result.data.materials.append(iron)
    clean_mesh(result)
    if guides is not None:
        collection.objects.unlink(obj)
        guides.objects.link(obj)
        obj.name = name + '_Guide'
        curve.bevel_depth = 0
        obj.hide_render = True
        obj.hide_set(True)
    else:
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.curves.remove(curve)
    return result


def validate(scene, steps, landing, marble, iron):
    assert len(steps) == 2 * STEPS
    assert isclose(RADIUS * TURN / STEPS, TREAD)
    assert isclose(max(v.co.z for v in landing.data.vertices), LANDING_Z, abs_tol=1e-6)
    for side in [-1, 1]:
        previous = BASE_Z
        for obj in [s for s in steps if s['side'] == side]:
            top = max(v.co.z for v in obj.data.vertices)
            assert isclose(top-previous, RISE, abs_tol=1e-6), obj.name
            previous = top
        assert isclose(previous, LANDING_Z, abs_tol=1e-6)
    for left, right in zip(steps[:STEPS], steps[STEPS:]):
        assert all((Vector((-a.co.x, a.co.y, a.co.z))-b.co).length < 1e-6
                   for a, b in zip(left.data.vertices, right.data.vertices))
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        assert len(obj.data.materials) == 1
        assert obj.data.materials[0] in (marble, iron)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        assert all(len(f.verts) in (3, 4) for f in bm.faces), obj.name
        assert all(e.is_manifold and e.is_contiguous for e in bm.edges), obj.name
        assert bm.calc_volume(signed=True) > 0, obj.name
        bm.free()
    print('STAIR CHECK OK: 28 peldaños simétricos, peralte 0.17, descanso 2.50; '
          'mallas cerradas, normales exteriores, sin N-gons, materiales separados.')


def create_staircase():
    if not (BASE_Z > 0 and STEPS > 0 and TREAD > 0 and RISE > 0
            and RADIUS > FLIGHT_WIDTH/2 and LANDING_DEPTH >= FLIGHT_WIDTH):
        raise ValueError('Parámetros incompatibles: revisar altura, radios y descanso.')
    scene = bpy.data.scenes.new('MUNAL_Staircase')
    bpy.context.window.scene = scene
    scene.unit_settings.system, scene.unit_settings.scale_length = 'METRIC', 1
    collections = []
    for name in ['Stair_Marble', 'Stair_Iron', 'Stair_Guides']:
        collection = bpy.data.collections.new(name)
        scene.collection.children.link(collection)
        collections.append(collection)
    stone, metal, guides = collections
    marble = material('Stair_Marble', (.76, .73, .68), .18)
    iron = material('Stair_WroughtIron', (.035, .041, .046), .30)
    iron.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = .9
    outer = LANDING_WIDTH/2 + RADIUS + FLIGHT_WIDTH/2
    front, rear = -RADIUS-.65, max(LANDING_DEPTH/2, FLIGHT_WIDTH/2)
    base = box('Stair_CommonStart_012', (0,(front+rear)/2,BASE_Z/2),
               (2*outer,rear-front,BASE_Z), stone, marble)
    landing = box('Stair_Landing_250', (0,0,(LANDING_Z+BASE_Z)/2),
                  (LANDING_WIDTH,LANDING_DEPTH,LANDING_Z-BASE_Z), stone, marble)
    for obj in [base, landing]:
        clean_mesh(obj)
        marble_uv(obj)
    steps = []
    for side in [-1, 1]:
        steps.extend(tread(side, i, stone, marble) for i in range(STEPS))
        for edge in [-1, 1]:
            radius = RADIUS + edge * (FLIGHT_WIDTH/2-.06)
            label = f'{side}_{edge}'
            guide_points = [path(side, radius, i/(STEPS*ARC_SEGMENTS),
                                 BASE_Z + STEPS*RISE*i/(STEPS*ARC_SEGMENTS) + RAIL_HEIGHT)
                            for i in range(STEPS*ARC_SEGMENTS+1)]
            tube('Handrail_'+label, guide_points, .035, metal, iron, guides)
            for i in range(STEPS):
                t = (i+.5)/STEPS
                bottom = BASE_Z + (i+1)*RISE
                top = BASE_Z + STEPS*RISE*t + RAIL_HEIGHT
                p = path(side, radius, t, bottom)
                tangent = Vector((-side*sin(TURN*t), cos(TURN*t), 0))
                tube(f'Baluster_{label}_{i}', [p, Vector((p.x,p.y,top))], .014, metal, iron)
                # Dos volutas planas enrolladas alrededor de cada balaustre.
                for sign in [-1, 1]:
                    points = []
                    for j in range(33):
                        u = j/32
                        angle = 2*pi*u
                        r = .095*(1-.85*u)
                        points.append(p + tangent*(sign*r*sin(angle)) +
                                      Vector((0,0,(top-bottom)*.5 + sign*(.095-r*cos(angle)))))
                    tube(f'Volute_{label}_{i}_{sign}', points, .009, metal, iron)
            # Postes terminales cierran visualmente el pasamanos contra el descanso.
            for t, bottom in [(0,BASE_Z+RISE),(1,LANDING_Z)]:
                p = path(side, radius, t, bottom)
                tube(f'Newel_{label}_{t}', [p, path(side,radius,t,BASE_Z+STEPS*RISE*t+RAIL_HEIGHT)],
                     .027, metal, iron)
    # Barandas del descanso; accesos laterales libres en el ancho de los tramos.
    for y in [-LANDING_DEPTH/2+.06, LANDING_DEPTH/2-.06]:
        tube(f'LandingRail_{y}', [(-LANDING_WIDTH/2,y,LANDING_Z+RAIL_HEIGHT),
                                 (LANDING_WIDTH/2,y,LANDING_Z+RAIL_HEIGHT)],
             .035, metal, iron, guides)
        for i in range(17):
            x = -LANDING_WIDTH/2+LANDING_WIDTH*i/16
            tube(f'LandingBaluster_{y}_{i}', [(x,y,LANDING_Z),(x,y,LANDING_Z+RAIL_HEIGHT)],
                 .014, metal, iron)
        for side in [-1,1]:
            x = side*LANDING_WIDTH/2
            tube(f'LandingReturn_{y}_{side}', [(x,y,LANDING_Z+RAIL_HEIGHT),
                 (x,(-1 if y < 0 else 1)*(FLIGHT_WIDTH/2-.06),LANDING_Z+RAIL_HEIGHT)],
                 .035, metal, iron)
    bpy.context.view_layer.update()
    validate(scene, steps, landing, marble, iron)
    return scene


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.output:
        args.output = args.output.resolve()
        for ext in ['.blend', '.glb', '.png']:
            if args.output.with_suffix(ext).exists():
                raise FileExistsError(args.output.with_suffix(ext))
        args.output.parent.mkdir(parents=True, exist_ok=True)
    scene = create_staircase()
    if args.output:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in scene.objects:
            if obj.type == 'MESH':
                obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(args.output.with_suffix('.glb')),
                                 export_format='GLB', use_selection=True, use_active_scene=True,
                                 export_extras=True, export_animations=False)
        camera_data = bpy.data.cameras.new('Stair_Camera')
        camera = bpy.data.objects.new('Stair_Camera', camera_data)
        scene.collection.objects.link(camera)
        camera.location = (9,-15,10)
        camera.rotation_euler = (Vector((0,-1,1.3))-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type, camera.data.ortho_scale = 'ORTHO', 14
        scene.camera = camera
        for i, position in enumerate([(0,-4,10),(-6,2,7),(6,3,5)]):
            data = bpy.data.lights.new(f'Stair_Light_{i}', 'AREA')
            data.energy, data.size = 1700, 7
            lamp = bpy.data.objects.new(data.name, data)
            scene.collection.objects.link(lamp)
            lamp.location = position
            lamp.rotation_euler = (Vector((0,-1,1))-lamp.location).to_track_quat('-Z','Y').to_euler()
        scene.world = bpy.data.worlds.new('Stair_World')
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.19,.22,.27,1)
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
        scene.render.engine, scene.cycles.samples = 'CYCLES', 32
        scene.cycles.use_denoising = True
        scene.render.resolution_x, scene.render.resolution_y = 1200, 900
        scene.render.resolution_percentage = 100
        for area in bpy.context.screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
        if args.render:
            scene.render.filepath = str(args.output.with_suffix('.png'))
            bpy.ops.render.render(write_still=True)
