"""Export final de la sala actual. Ejecutar sobre assets/exhibition-room.blend.

No sobrescribe salidas existentes ni el .blend original. Reutiliza bake_hall.py.
"""
from math import radians
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bake_hall as pipeline
from create_exhibition_room import WIDTH, WINDOW_Y, WINDOW_WIDTH, WINDOW_SILL, WINDOW_HEAD

ROOT = Path(__file__).resolve().parents[1]


def srgb(rgb):
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)


def texture_material(mat, path):
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    texture.image.colorspace_settings.name = 'sRGB'
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    links.new(uv.outputs['UV'], texture.inputs['Vector'])
    links.new(texture.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])


def lighting(scene):
    for obj in scene.objects:
        if obj.type == 'LIGHT':
            obj.hide_render = True
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    collection = bpy.data.collections.new('Room_BakeLights')
    scene.collection.children.link(collection)
    for index in range(1, 9):
        plane = scene.objects[f'Artwork_{index:02d}']
        target = sum((plane.matrix_world @ Vector(v) for v in plane.bound_box), Vector()) / 8
        normal = (plane.matrix_world.to_3x3() @ plane.data.polygons[0].normal).normalized()
        position = target + normal * 1.8
        position.z = 5.1
        data = bpy.data.lights.new(f'Room_Spot_{index:02d}', 'SPOT')
        data.energy = 250
        data.color = srgb((1, 224 / 255, 178 / 255))
        data.shadow_soft_size = .10
        data.spot_size, data.spot_blend = radians(45), .35
        lamp = bpy.data.objects.new(data.name, data)
        collection.objects.link(lamp)
        lamp.location = position
        lamp.rotation_euler = (target-position).to_track_quat('-Z', 'Y').to_euler()
        lamp['artwork_target'] = tuple(target)
    data = bpy.data.lights.new('Room_SoftCeiling', 'AREA')
    data.energy, data.shape, data.size, data.size_y = 100, 'RECTANGLE', 4, 8
    data.color = srgb((1, .82, .64))
    lamp = bpy.data.objects.new(data.name, data)
    collection.objects.link(lamp)
    lamp.location = (0, 0, 5.15)
    # Fuentes justo dentro del vano, delante del panel opaco, mirando a la sala.
    for side in [-1, 1]:
        for index, y in enumerate(WINDOW_Y):
            data = bpy.data.lights.new(f'Room_Window_{side}_{index}', 'AREA')
            data.energy, data.shape = 500, 'RECTANGLE'
            data.size, data.size_y = WINDOW_WIDTH, WINDOW_HEAD-WINDOW_SILL
            data.color = srgb((1, 244/255, 222/255))
            lamp = bpy.data.objects.new(data.name, data)
            collection.objects.link(lamp)
            lamp.location = (side*(WIDTH/2-.01), y, (WINDOW_SILL+WINDOW_HEAD)/2)
            lamp.rotation_euler = Vector((-side,0,0)).to_track_quat('-Z','Y').to_euler()
            assert (lamp.rotation_euler.to_matrix() @ Vector((0,0,-1))).dot(Vector((-side,0,0))) > .999
    assert len(collection.objects) == 17
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    # Cycles Diffuse bake no aplica automáticamente el denoiser de render.


def main():
    pipeline.SIZE, pipeline.SAMPLES = 4096, 1024
    pipeline.OUTPUT = ROOT / 'assets/munal-gallery-baked.blend'
    pipeline.PNG = ROOT / 'public/textures/munal_room_lightmap.png'
    pipeline.EXR = ROOT / 'assets/munal_room_lightmap.exr'
    pipeline.GLB = ROOT / 'public/models/munal_gallery.glb'
    pipeline.REPORT = ROOT / 'assets/munal-room-lightmap-report.json'
    for path in [pipeline.OUTPUT, pipeline.PNG, pipeline.EXR, pipeline.GLB, pipeline.REPORT]:
        if path.exists():
            raise FileExistsError(path)
    scene = bpy.data.scenes['MUNAL_ExhibitionRoom']
    bpy.context.window.scene = scene
    room = scene.objects['Architecture_Room']
    parquet = bpy.data.materials['Mat_Parquet_Suelo']
    texture_material(parquet, ROOT / 'public/textures/dark-oak-herringbone.png')
    shader = parquet.node_tree.nodes['Principled BSDF']
    shader.inputs['Roughness'].default_value = .25
    shader.inputs['Metallic'].default_value = .05
    # Mantener el verde de la sala; la textura de parquet ya usa el UV0 métrico.
    for index in range(1, 9):
        plane = scene.objects[f'Artwork_{index:02d}']
        plane['slotIndex'] = index - 1
        mat = plane.data.materials[0].copy()
        mat.name = f'Mat_Artwork_{index:02d}'
        plane.data.materials[0] = mat
        texture_material(mat, ROOT / f'public/artworks/{index}.jpeg')
        frame = scene.objects[f'Frame_{index:02d}']
        shader = frame.data.materials[0].node_tree.nodes['Principled BSDF']
        shader.inputs['Base Color'].default_value = (*srgb((212/255, 175/255, 55/255)), 1)
        shader.inputs['Metallic'].default_value = .85
        shader.inputs['Roughness'].default_value = .3
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    assert len(meshes) == 18
    pipeline.bake(scene_name=scene.name, bake_objects=[room], expected_modules=1,
                  collider_name='Collider_Room', export_objects=meshes,
                  expected_uv_primitives=4, lighting=lighting)


if __name__ == '__main__':
    main()
