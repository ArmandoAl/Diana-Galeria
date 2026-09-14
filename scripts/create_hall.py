"""Blender 4.x+: ejecutar desde Scripting > Run Script o con --python.

CLI: blender --background --python scripts/create_hall.py -- --output /ruta/hall
Sin --output crea una escena nueva sin guardar ni borrar el trabajo abierto.
"""
import argparse
from math import pi
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

WIDTH, LENGTH, HEIGHT = 16.0, 24.0, 8.0
WALL = 0.30
MODULE = 4


def mesh_object(name, vertices, faces, collection, material=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if material:
        mesh.materials.append(material)
    return obj


def box(name, center, size, collection, material=None):
    # Coordenadas ya horneadas: equivalente a aplicar Location/Rotation/Scale.
    vertices = [tuple(center[i] + corner[i] * size[i] / 2 for i in range(3))
                for corner in [(-1,-1,-1), (1,-1,-1), (1,1,-1), (-1,1,-1),
                               (-1,-1,1), (1,-1,1), (1,1,1), (-1,1,1)]]
    return mesh_object(name, vertices, [(3,2,1,0), (4,5,6,7), (0,1,5,4),
                                       (1,2,6,5), (2,3,7,6), (3,0,4,7)],
                       collection, material)


def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat


def pilaster(name, position, angle, collection, plaster, height=8.0):
    # Perfil rectangular extruido: plinto, toros biselados, fuste, equino y ábaco.
    profile = [(0,1.10,.42), (.16,1.10,.42), (.22,.98,.36),
               (.30,1.02,.38), (.38,.82,.28), (6.80,.82,.28),
               (6.88,.92,.34), (6.98,.92,.34), (7.10,1.08,.44),
               (7.24,1.16,.48), (7.38,1.16,.48)]
    rotation = Matrix.Rotation(angle, 4, 'Z')
    vertices = []
    for z, width, depth in profile:
        for x, y in [(-width/2,-.02), (width/2,-.02),
                     (width/2,depth), (-width/2,depth)]:
            vertices.append(rotation @ Vector((x,y,z*height/8.0)) + Vector(position))
    faces = [(3,2,1,0)]
    for level in range(len(profile)-1):
        a = level * 4
        for i in range(4):
            j = (i+1) % 4
            faces.append((a+i, a+j, a+j+4, a+i+4))
    a = (len(profile)-1)*4
    faces.append((a,a+1,a+2,a+3))
    return mesh_object(name, vertices, faces, collection, plaster)


def validate(scene, floor, collider):
    """Chequeo ejecutable de escala, sólidos, modulación y UV del piso."""
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    for obj in meshes:
        assert obj.matrix_world == Matrix.Identity(4), obj.name
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        assert all(edge.is_manifold for edge in bm.edges), obj.name
        assert bm.calc_volume(signed=True) > 0, obj.name
        bm.free()
    assert sum(obj.name.startswith('Pilaster_') for obj in meshes) == 16
    assert len(collider.data.polygons) == 36
    assert collider.name == 'Collider_Hall' and collider['collider'] is True
    assert tuple(round(v, 3) for v in floor.dimensions) == (WIDTH, LENGTH, .2)
    top = [face for face in floor.data.polygons if face.normal.z > .9]
    assert len(top) == int(WIDTH * LENGTH)
    for face in top:
        for index in face.loop_indices:
            vertex = floor.data.vertices[floor.data.loops[index].vertex_index].co
            uv = floor.data.uv_layers['UVMap'].data[index].uv
            assert abs(uv.x - (vertex.x + WIDTH/2)) < 1e-5
            assert abs(uv.y - (vertex.y + LENGTH/2)) < 1e-5
    print(f'HALL CHECK OK: {len(meshes)} mallas; 16 pilastras; 384 baldosas; collider sólido.')


def create_hall():
    if bpy.data.objects.get('Collider_Hall'):
        raise RuntimeError('Ya existe Collider_Hall. Usa un archivo nuevo para regenerar.')
    scene = bpy.data.scenes.new('MUNAL_Hall')
    bpy.context.window.scene = scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    architecture = bpy.data.collections.new('Hall_Architecture')
    collisions = bpy.data.collections.new('Hall_Collisions')
    scene.collection.children.link(architecture)
    scene.collection.children.link(collisions)
    plaster = material('Hall_IvoryPlaster', (.72,.65,.52), .8)
    marble = material('Hall_MarblePlaceholder', (.82,.80,.76), .08)

    perimeter = [((-8.15,0,4),(.3,24.6,8)), ((8.15,0,4),(.3,24.6,8)),
                 ((0,-12.15,4),(16,.3,8)), ((0,12.15,4),(16,.3,8))]
    for i, (center, size) in enumerate(perimeter):
        box(f'Wall_{i+1}', center, size, architecture, plaster)

    # Rejilla XY de 1 m, normal +Z, UV sin rotación: una repetición por metro.
    nx, ny = int(WIDTH), int(LENGTH)
    vertices = [(x-WIDTH/2,y-LENGTH/2,0) for y in range(ny+1) for x in range(nx+1)]
    faces = []
    for y in range(ny):
        for x in range(nx):
            a = y*(nx+1)+x
            faces.append((a,a+1,a+nx+2,a+nx+1))
    floor = mesh_object('Floor_MarbleGrid', vertices, faces, architecture, marble)
    uv = floor.data.uv_layers.new(name='UVMap')
    for loop in floor.data.loops:
        co = floor.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (co.x+WIDTH/2, co.y+LENGTH/2)
    bpy.context.view_layer.objects.active = floor
    solid = floor.modifiers.new('FloorThickness', 'SOLIDIFY')
    solid.thickness, solid.offset = .2, -1
    bpy.ops.object.modifier_apply(modifier=solid.name)

    for x, angle in [(-8,-pi/2),(8,pi/2)]:
        for y in range(-8,9,MODULE):
            pilaster(f'Pilaster_X{x}_Y{y}', (x,y,0), angle, architecture, plaster)
    for y, angle in [(-12,0),(12,pi)]:
        for x in range(-4,5,MODULE):
            pilaster(f'Pilaster_Y{y}_X{x}', (x,y,0), angle, architecture, plaster)

    # Losa cerrada a Z=8; nervios inferiores forman 4 × 6 casetones hundidos.
    box('Ceiling_Slab', (0,0,8.15), (16.6,24.6,.3), architecture, plaster)
    for z, width, height in [(7.50,.50,.20),(7.68,.36,.16),(7.88,.24,.24)]:
        for x in range(-8,9,MODULE):
            box(f'Coffer_X{x}_{z}', (x,0,z), (width,24,height), architecture, plaster)
        for y in range(-12,13,MODULE):
            for x in range(-6,7,MODULE):
                box(f'Coffer_Y{y}_X{x}_{z}', (x,y,z),
                    (MODULE-width,width,height), architecture, plaster)
    for z, depth, height in [(.12,.16,.24),(7.38,.48,.16),(7.55,.56,.18)]:
        for x in [-8,8]:
            box(f'Cornice_X{x}_{z}', (x,0,z), (depth*2,24,height), architecture, plaster)
        for y in [-12,12]:
            box(f'Cornice_Y{y}_{z}', (0,y,z), (16,depth*2,height), architecture, plaster)

    # Seis cajas en una sola malla: cuatro muros, piso y límite inferior del plafón.
    parts = [box('ColliderPart', center, size, collisions) for center, size in
             perimeter + [((0,0,-.1),(16,24,.2)), ((0,0,7.85),(16,24,.9))]]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    collider = parts[0]
    collider.name = 'Collider_Hall'
    collider['collider'] = True
    collider['type'] = 'trimesh'
    collider.display_type = 'WIRE'
    collider.hide_render = True
    collider.hide_set(True)

    camera_data = bpy.data.cameras.new('Hall_Camera')
    camera = bpy.data.objects.new('Hall_Camera', camera_data)
    scene.collection.objects.link(camera)
    camera.location = (0,-10,2)
    camera.rotation_euler = (Vector((0,3,4))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.lens = 20
    scene.camera = camera
    for y in [-8,0,8]:
        data = bpy.data.lights.new(f'Hall_Area_{y}', 'AREA')
        data.energy, data.shape, data.size = 1800, 'DISK', 6
        lamp = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(lamp)
        lamp.location = (0,y,7.2)
    scene.world = bpy.data.worlds.new('Hall_World')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .15
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1200, 800
    scene.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    validate(scene, floor, collider)
    return scene, collider


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Ruta base sin extensión; guarda .blend y .glb')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.output:
        args.output = args.output.resolve()
        for suffix in ['.blend','.glb']:
            if args.output.with_suffix(suffix).exists():
                raise FileExistsError(args.output.with_suffix(suffix))
        args.output.parent.mkdir(parents=True, exist_ok=True)
    scene, collider = create_hall()
    if args.output:
        collider.hide_set(False)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in scene.objects:
            if obj.type == 'MESH':
                obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(args.output.with_suffix('.glb')),
                                  export_format='GLB', use_selection=True, use_active_scene=True,
                                  export_extras=True, export_yup=True,
                                  export_animations=False)
        collider.hide_set(True)
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
