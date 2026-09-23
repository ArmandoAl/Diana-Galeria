"""Amplía el .blend iluminado con tres ambientes; conserva el original.

blender -b assets/munal-gallery-baked.blend --python-exit-code 1 \
  --python scripts/create_gallery_sections.py
"""
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bake_hall as pipeline
from bake_exhibition_room import srgb
from create_hall import box, material
from create_exhibition_room import planar_uv, select

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/munal-gallery-sections.blend'


def main():
    pipeline.OUTPUT = OUTPUT
    pipeline.GLB = ROOT / 'public/models/munal_gallery_sections.glb'
    pipeline.PNG = ROOT / 'public/textures/munal_sections_lightmap.png'
    pipeline.EXR = ROOT / 'assets/munal_sections_lightmap.exr'
    pipeline.REPORT = ROOT / 'assets/munal-sections-lightmap-report.json'
    pipeline.SIZE, pipeline.SAMPLES = 4096, 1024
    for path in [OUTPUT, pipeline.GLB, pipeline.PNG, pipeline.EXR, pipeline.REPORT]:
        if path.exists():
            raise FileExistsError(path)
    scene = bpy.data.scenes['MUNAL_ExhibitionRoom']
    bpy.context.window.scene = scene
    room = scene.objects['Architecture_Room']
    collider = scene.objects['Collider_Room']
    # El proyecto se movió fuera de munal-virtual: resolver y empacar texturas.
    for image in bpy.data.images:
        if image.source != 'FILE':
            continue
        name = Path(image.filepath).name
        path = ROOT / 'public' / ('artworks' if name.endswith('.jpeg') else 'textures') / name
        if not path.is_file():
            raise FileNotFoundError(path)
        image.filepath = str(path)
        image.reload()
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for node in list(mat.node_tree.nodes):
                if node.name.startswith('Bake_Target'):
                    mat.node_tree.nodes.remove(node)
    room.data.uv_layers.remove(room.data.uv_layers['LightmapUV'])
    red = material('Mat_Mampara_RojoMUNAL', srgb((.24, .025, .055)), .82)
    ivory = bpy.data.materials['Mat_Pilastra_Marfil']
    oak = material('Mat_Zocalo_Mampara', srgb((.28, .15, .075)), .4)
    collection = bpy.data.collections.new('Salas_Conectadas')
    scene.collection.children.link(collection)
    anchors = bpy.data.collections.new('Espacios_Para_Nuevas_Obras')
    scene.collection.children.link(anchors)
    parts, barriers = [], []
    # 4.8 m de muro y 3.2 m de paso alternado; sin bloquear vanos ni cuadros.
    for index, (x, y) in enumerate([(-1.6, -3.4), (1.6, 3.4)], 1):
        for suffix, center, size, mat in [
            ('Muro', (x, y, 1.8), (4.8, .24, 3.6), red),
            ('Zocalo', (x, y, .12), (4.8, .30, .24), oak),
            ('Remate', (x, y, 3.62), (4.8, .30, .08), ivory),
        ]:
            obj = box(f'Mampara_{index}_{suffix}', center, size, collection, mat)
            planar_uv(obj)
            obj.vertex_groups.new(name=f'Mampara_{index}').add(
                list(range(len(obj.data.vertices))), 1, 'REPLACE')
            parts.append(obj)
        barriers.append(box(f'Collision_Mampara_{index}', (x, y, 1.85),
                            (4.8, .30, 3.7), collider.users_collection[0]))
        for side in [-1, 1]:
            for offset in [-1.1, 1.1]:
                anchor = bpy.data.objects.new(f'Reserva_{index}_{side}_{offset}', None)
                anchors.objects.link(anchor)
                anchor.location = (x + offset, y + side * .14, 1.65)
                anchor.empty_display_type = 'CUBE'
                anchor.empty_display_size = .15
                anchor['canvas_size_m'] = (1.8, 1.2)
                anchor['normal_blender'] = (0, side, 0)
                anchor['status'] = 'Espacio disponible; no es una obra publicada'
            data = bpy.data.lights.new(f'Mampara_{index}_Wash_{side}', 'AREA')
            data.energy, data.shape, data.size, data.size_y = 120, 'RECTANGLE', 3.8, .3
            data.color = srgb((1, .88, .72))
            lamp = bpy.data.objects.new(data.name, data)
            collection.objects.link(lamp)
            lamp.location = (x, y + side * 1.1, 3.8)
            lamp.rotation_euler = (Vector((x, y, 1.8)) - lamp.location).to_track_quat('-Z', 'Y').to_euler()
    select([room, *parts])
    bpy.ops.object.join()
    select([collider, *barriers])
    bpy.ops.object.join()
    collider.hide_render = True
    collider['interior_partitions'] = 2
    scene['design'] = 'Tres ambientes; mamparas rojas alternadas, pasos de 3.2 m'
    scene['additional_display_spaces'] = 8
    # Regresión: mamparas sólidas y ambos pasos realmente libres a altura humana.
    bpy.context.view_layer.update()
    for wall_x, passage_x, y in [(-1.6, 2.3, -3.4), (1.6, -2.3, 3.4)]:
        for obj in [room, collider]:
            assert obj.ray_cast(Vector((wall_x, y-1, 1.65)), Vector((0, 1, 0)), distance=2)[0]
            assert not obj.ray_cast(Vector((passage_x, y-1, 1.65)), Vector((0, 1, 0)), distance=2)[0]
    assert len(anchors.objects) == 8
    collider.hide_set(True)
    scene.camera.location = (2.5, -6.8, 1.8)
    scene.camera.rotation_euler = (Vector((-.3, 1, 2.1))-scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera.data.lens = 20
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    pipeline.bake(scene_name=scene.name, bake_objects=[room], expected_modules=1,
                  collider_name=collider.name, export_objects=meshes,
                  expected_uv_primitives=6, lighting=lambda scene: None)
    bpy.ops.file.pack_all()
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.color_management = 'FOLLOW_SCENE'
    scene.render.image_settings.color_depth = '8'
    scene.cycles.samples = 64
    scene.render.resolution_x, scene.render.resolution_y = 1200, 800
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(ROOT / 'assets/munal-gallery-sections-preview.png')
    bpy.ops.object.select_all(action='DESELECT')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
                area.spaces.active.shading.type = 'MATERIAL'
                area.spaces.active.shading.use_scene_lights = True
                area.spaces.active.shading.use_scene_world = True
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
    bpy.ops.render.render(write_still=True)
    print('SECTIONS CHECK OK: tres ambientes, ocho reservas, pasos y texturas empacadas.', flush=True)


if __name__ == '__main__':
    main()
