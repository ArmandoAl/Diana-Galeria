"""Blender: abrir munal-gallery-sections.blend y ejecutar este script.
Produce una versión independiente, ventanas transparentes, puertas y 14 montajes.
"""
from pathlib import Path
from math import radians
import sys
import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bake_hall as pipeline
import create_exhibition_room as exhibition
from create_hall import box, material, mesh_object
from bake_exhibition_room import srgb, texture_material

ROOT = Path(__file__).resolve().parents[1]


def join(parts, name):
    exhibition.select(parts)
    bpy.ops.object.join()
    parts[0].name = name
    return parts[0]


def main():
    pipeline.OUTPUT = ROOT / 'assets/munal-gallery-daylight.blend'
    pipeline.GLB = ROOT / 'public/models/munal_gallery_daylight.glb'
    pipeline.PNG = ROOT / 'public/textures/munal_daylight_lightmap.png'
    pipeline.EXR = ROOT / 'assets/munal_daylight_lightmap.exr'
    pipeline.REPORT = ROOT / 'assets/munal-daylight-report.json'
    pipeline.SIZE, pipeline.SAMPLES = 4096, 1024
    for path in [pipeline.OUTPUT, pipeline.GLB, pipeline.PNG, pipeline.EXR, pipeline.REPORT]:
        if path.exists():
            raise FileExistsError(path)
    scene = bpy.context.scene
    room = scene.objects['Architecture_Room']
    collider = scene.objects['Collider_Room']
    collection = bpy.data.collections.new('Daylight_Windows_Doors')
    scene.collection.children.link(collection)
    # Reemplazar el vidrio emisivo, no cubrirlo con otra superficie.
    glass_group = room.vertex_groups['WindowGlass'].index
    indices = {v.index for v in room.data.vertices if any(g.group == glass_group for g in v.groups)}
    bm = bmesh.new()
    bm.from_mesh(room.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index in indices], context='VERTS')
    bm.to_mesh(room.data)
    bm.free()
    room.data.uv_layers.remove(room.data.uv_layers['LightmapUV'])
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for node in list(mat.node_tree.nodes):
                if node.name.startswith('Bake_Target'):
                    mat.node_tree.nodes.remove(node)
    green = bpy.data.materials['Mat_Pared_VerdeMUNAL']
    partition = bpy.data.materials['Mat_Mampara_RojoMUNAL']
    partition.name = 'Mat_Mampara_Tono'
    ivory = bpy.data.materials['Mat_Pilastra_Marfil']
    wood = bpy.data.materials['Mat_Zocalo_Mampara']
    brass = material('Mat_Laton_Cepillado', srgb((.56,.40,.19)), .38)
    brass.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = .55
    glass = material('Mat_Cristal_Claro', (.96,.99,1), .07)
    shader = glass.node_tree.nodes['Principled BSDF']
    shader.inputs['Transmission Weight'].default_value = 1
    shader.inputs['IOR'].default_value = 1.45
    garden = material('Mat_Garden_Backdrop', (1,1,1), 1)
    texture_material(garden, ROOT / 'public/textures/museum-garden.png')
    nodes, links = garden.node_tree.nodes, garden.node_tree.links
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = .8
    texture = next(n for n in nodes if n.type == 'TEX_IMAGE')
    links.new(texture.outputs['Color'], emission.inputs['Color'])
    links.new(emission.outputs[0], nodes.get('Material Output').inputs['Surface'])
    architecture, panes, backdrops, doors = [room], [], [], []
    # Cubre el encuentro inferior donde las dos mamparas tocan los muros laterales.
    corner_caps = [box('Zocalo_Remate_Esquina_1', (-3.85,-3.4,.12), (.32,.32,.24), collection, wood),
                   box('Zocalo_Remate_Esquina_2', (3.85,3.4,.12), (.32,.32,.24), collection, wood)]
    for cap in corner_caps:
        exhibition.planar_uv(cap)

    def part(name, center, size, mat, target):
        obj = box(name, center, size, collection, mat)
        exhibition.planar_uv(obj)
        target.append(obj)
        return obj

    for side in [-1,1]:
        for i, y in enumerate(exhibition.WINDOW_Y):
            x = side * 4.02
            for yy in [y-.6, y, y+.6]:
                part(f'Window_Jamb_{side}_{i}_{yy:.2f}', (x,yy,2.6), (.12,.045,3.2), wood, architecture)
            for z in [1,2.1,3.2,4.2]:
                part(f'Window_Rail_{side}_{i}_{z}', (x,y,z), (.12,1.2,.045), wood, architecture)
            part(f'Window_Sill_{side}_{i}', (side*3.95,y,.98), (.32,1.35,.075), ivory, architecture)
            pane = part(f'Window_Glass_{side}_{i}', (side*4.10,y,2.6), (.008,1.16,3.16), glass, panes)
            pane.visible_shadow = False
        # Un fondo panorámico por fachada: el paisaje continúa entre ventanas.
        obj = mesh_object(f'Garden_{side}', [(side*12,-15,-7),(side*12,15,-7),
                          (side*12,15,13),(side*12,-15,13)], [(0,1,2,3)], collection, garden)
        uv = obj.data.uv_layers.new(name='UVMap')
        for loop, value in zip(uv.data, [(0,0),(1,0),(1,1),(0,1)]):
            loop.uv = value
        obj.visible_shadow = False
        obj.visible_diffuse = False
        backdrops.append(obj)
        pieces = []
        for leaf in [-1,1]:
            part('Door_Leaf', (leaf*.35,side*8.02,1.4), (.705,.12,2.78), wood, pieces)
            for z, h in [(.65,.85),(1.95,1.25)]:
                part('Door_RecessedPanel', (leaf*.35,side*7.948,z), (.49,.035,h), wood, pieces)
                for xx in [leaf*.35-.26,leaf*.35+.26]:
                    part('Door_Moulding', (xx,side*7.92,z), (.035,.04,h+.04), wood, pieces)
                for zz in [z-h/2,z+h/2]:
                    part('Door_Moulding', (leaf*.35,side*7.92,zz), (.55,.04,.035), wood, pieces)
            part('Door_HandlePlate', (leaf*.10,side*7.90,1.25), (.07,.045,.28), brass, pieces)
            part('Door_Handle', (leaf*.10,side*7.85,1.25), (.035,.065,.16), brass, pieces)
        for x in [-.77,.77]:
            part('Door_Architrave', (x,side*7.94,1.45), (.12,.16,2.9), ivory, pieces)
        part('Door_Lintel', (0,side*7.94,2.88), (1.66,.16,.16), ivory, pieces)
        door = join(pieces, 'Door_Next' if side == 1 else 'Door_Previous')
        door['doorDirection'] = side
        doors.append(door)
    room = join(architecture, 'Architecture_Room')

    for obj in list(scene.objects):
        if obj.name.startswith(('Artwork_', 'Frame_', 'Reserva_')):
            bpy.data.objects.remove(obj, do_unlink=True)
    # Centros exactos entre vanos: ±4.4, no ±4.8. Ocho posiciones en mamparas.
    placements = [((side*3.98,y,1.65),(0,-side,0)) for side in [-1,1] for y in [-4.4,0,4.4]]
    placements += [((x+offset,y+side*.14,1.65),(-side,0,0))
                   for x,y in [(-1.6,-3.4),(1.6,3.4)] for side in [-1,1] for offset in [-1.1,1.1]]
    art_objects = []
    canvas = material('Mat_Canvas', (.75,.72,.66), .85)
    for index, (center,tangent) in enumerate(placements,1):
        exhibition.ART_WIDTH, exhibition.ART_HEIGHT = 1.8, 1.5
        if index <= 8:
            image = bpy.data.images.load(str(ROOT / f'public/artworks/{index}.jpeg'), check_existing=True)
            aspect = image.size[0] / image.size[1]
            exhibition.ART_WIDTH = min(1.8,1.5*aspect)
            exhibition.ART_HEIGHT = min(1.5,1.8/aspect)
        plane, frame = exhibition.artwork(index,center,tangent,collection,canvas,brass,room)
        plane['slotIndex'] = index-1
        plane['display_center'] = center
        plane['display_tangent'] = tangent
        for obj in [plane,frame]:
            obj['display_width'], obj['display_height'] = exhibition.ART_WIDTH,exhibition.ART_HEIGHT
            obj['max_width'], obj['max_height'] = 1.8,1.5
        if index <= 8:
            mat = canvas.copy()
            plane.data.materials[0] = mat
            texture_material(mat, ROOT / f'public/artworks/{index}.jpeg')
        art_objects.extend([plane,frame])
    assert len(placements) == 14
    # Verificar que cada montaje queda delante de un muro y centrado verticalmente.
    bpy.context.view_layer.update()
    for center,tangent in placements:
        normal = Vector(tangent).cross(Vector((0,0,1)))
        assert room.ray_cast(Vector(center),-normal,distance=.05)[0], center

    for obj in scene.objects:
        if obj.type == 'LIGHT':
            obj.hide_render = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.65,.78,1,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .22
    sun = bpy.data.lights.new('Daylight_Sun', 'SUN')
    sun.energy, sun.angle, sun.color = 14, radians(2), (1,.91,.76)
    lamp = bpy.data.objects.new(sun.name,sun)
    collection.objects.link(lamp)
    lamp.rotation_euler = Vector((1,.38,-.82)).to_track_quat('-Z','Y').to_euler()
    for side in [-1,1]:
        for y in exhibition.WINDOW_Y:
            data = bpy.data.lights.new('Daylight_SkyFill','AREA')
            data.energy, data.shape, data.size, data.size_y = 65,'RECTANGLE',1.1,3.1
            data.color = (.79,.88,1)
            light = bpy.data.objects.new(data.name,data)
            collection.objects.link(light)
            light.location = (side*3.99,y,2.6)
            light.rotation_euler = Vector((-side,0,0)).to_track_quat('-Z','Y').to_euler()
    for i,(center,tangent) in enumerate(placements):
        normal = Vector(tangent).cross(Vector((0,0,1)))
        data = bpy.data.lights.new(f'Daylight_Artwork_{i}','AREA')
        data.energy, data.shape, data.size = 22,'DISK',.4
        data.color = (1,.91,.79)
        light = bpy.data.objects.new(data.name,data)
        collection.objects.link(light)
        light.location = Vector(center)+normal*1.0
        light.location.z = 3.4
        light.rotation_euler = (Vector(center)-light.location).to_track_quat('-Z','Y').to_euler()
    # Bake neutro para compartir irradiancia entre paletas sin reflejos rojos heredados.
    for mat in [green,partition]:
        mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.3,.3,.3,1)
    for obj in panes+art_objects:
        obj.hide_render = True
    meshes = [room,collider,*doors,*panes,*backdrops,*art_objects,*corner_caps]
    baked = [room,*doors,*corner_caps]
    expected = sum(len({p.material_index for p in obj.data.polygons}) for obj in baked)
    pipeline.bake(scene_name=scene.name,bake_objects=baked,expected_modules=5,
                  collider_name=collider.name,export_objects=meshes,
                  expected_uv_primitives=expected,lighting=lambda scene: None)
    for mat,rgb in [(green,(135/255,151/255,128/255)),(partition,(75/255,96/255,75/255))]:
        mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*srgb(rgb),1)
    for obj in panes+art_objects[:16]:
        obj.hide_render = False
    scene['room_capacity'] = 14
    scene['lighting_note'] = 'Irradiancia neutra para paletas; sol y sombras de ventanas horneados.'
    # Exportar con colores verdes; la app aplica su paleta al reutilizar la sala.
    exhibition.select(meshes)
    bpy.ops.export_scene.gltf(filepath=str(pipeline.GLB),export_format='GLB',use_selection=True,
                             use_active_scene=True,export_apply=True,export_extras=True,
                             export_animations=False,export_lights=False)
    collider.hide_set(True)
    bpy.ops.file.pack_all()
    scene.camera.location = (2.4,-6.8,1.75)
    scene.camera.rotation_euler = (Vector((-.6,1,2))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.lens = 20
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.color_management = 'FOLLOW_SCENE'
    scene.render.image_settings.color_depth = '8'
    scene.cycles.samples = 64
    scene.render.resolution_x,scene.render.resolution_y = 1400,900
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(ROOT / 'assets/munal-gallery-daylight-preview.png')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(pipeline.OUTPUT))
    bpy.ops.render.render(write_still=True)
    scene.camera.location = (1.5,0,1.75)
    scene.camera.rotation_euler = (Vector((-3.5,-2.4,2.1))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(ROOT / 'assets/munal-gallery-daylight-window.png')
    bpy.ops.render.render(write_still=True)
    print('DAYLIGHT OK: 14 montajes centrados, 8 ventanas, jardín y dos puertas.',flush=True)


if __name__ == '__main__':
    main()
