"""Bake Cycles de la sala existente, sin sobrescribir el modelo fuente.

blender -b assets/hall.blend --python-exit-code 1 --python scripts/bake_hall.py
Salida: assets/hall-baked.blend y public/{models, textures}/.
"""
import json
from math import radians
from pathlib import Path
import struct

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SIZE, SAMPLES = 4096, 256
OUTPUT = ROOT / 'assets/hall-baked.blend'
PNG = ROOT / 'public/textures/munal_lightmap.png'
EXR = ROOT / 'assets/munal_lightmap.exr'
GLB = ROOT / 'public/models/hall-baked.glb'
REPORT = ROOT / 'assets/lightmap-report.json'


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def unwrap(objects, scene):
    for obj in objects:
        uv = obj.data.uv_layers
        if not uv:
            uv.new(name='UVMap')
            for face in obj.data.polygons:
                axes = (0,1) if abs(face.normal.z) > .5 else (
                    (1,2) if abs(face.normal.x) > abs(face.normal.y) else (0,2))
                for i in face.loop_indices:
                    co = obj.data.vertices[obj.data.loops[i].vertex_index].co
                    uv[0].data[i].uv = (co[axes[0]], co[axes[1]])
        assert len(uv) == 1, f'{obj.name}: se esperaba solo UV0 antes del bake'
        uv.new(name='LightmapUV')
        uv.active_index = 1
        uv[0].active_render = True
    select(objects)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=.008,
                             margin_method='FRACTION')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=.008)
    scene.tool_settings.use_uv_select_sync = False
    bpy.ops.uv.select_all(action='DESELECT')
    bpy.ops.uv.select_overlap(extend=False)
    overlap = 0
    for obj in objects:
        bm = bmesh.from_edit_mesh(obj.data)
        layer = bm.loops.layers.uv['LightmapUV']
        overlap += sum(loop.uv_select_vert if hasattr(loop, 'uv_select_vert') else loop[layer].select
                       for face in bm.faces for loop in face.loops)
    bpy.ops.object.mode_set(mode='OBJECT')
    assert overlap == 0, f'{overlap} loops UV seleccionados por solapamiento'
    for obj in objects:
        assert all(-1e-6 <= value <= 1+1e-6
                   for loop in obj.data.uv_layers[1].data for value in loop.uv)
    print(f'UV CHECK OK: atlas global de {len(objects)} módulos sin solapamientos.', flush=True)


def setup_lighting(scene):
    for obj in scene.objects:
        if obj.type == 'LIGHT':
            obj.hide_render = True
    collection = bpy.data.collections.new('Hall_BakeLights')
    scene.collection.children.link(collection)
    # #FFE4BD convertido de sRGB a lineal; no es una conversión Kelvin exacta.
    color = tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4
                  for v in (1,228/255,189/255))
    targets = [((side*6.3,y,6.4),(side*7.98,y,3.1))
               for side in [-1,1] for y in [-10,-6,-2,2,6,10]]
    targets += [((x,side*10.3,6.4),(x,side*11.98,3.1))
                for side in [-1,1] for x in [-6,-2,2,6]]
    for i, (position, target) in enumerate(targets):
        data = bpy.data.lights.new(f'Artwork_Spot_{i+1:02d}', 'SPOT')
        data.energy, data.color, data.shadow_soft_size = 700, color, .15
        data.spot_size, data.spot_blend = radians(50), .65
        obj = bpy.data.objects.new(data.name, data)
        collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
        obj['artwork_target'] = target
    data = bpy.data.lights.new('Atrium_DiffuseSkylight', 'AREA')
    data.energy, data.shape, data.size, data.size_y = 3500, 'RECTANGLE', 6, 10
    obj = bpy.data.objects.new(data.name, data)
    collection.objects.link(obj)
    # Fuente interior virtual: el modelo actual tiene un plafón sólido, sin vano.
    obj.location = (0,0,7.25)


def bake(scene_name='MUNAL_Hall', bake_objects=None, expected_modules=133,
         collider_name='Collider_Hall', export_objects=None,
         expected_uv_primitives=None, lighting=setup_lighting):
    for path in [OUTPUT, PNG, EXR, GLB, REPORT]:
        if path.exists():
            raise FileExistsError(f'Salida existente: {path}; usa otra ruta para una nueva versión.')
        path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.data.scenes[scene_name]
    bpy.context.window.scene = scene
    objects = bake_objects if bake_objects is not None else [
        obj for obj in scene.objects if obj.type == 'MESH' and not obj.get('collider')]
    assert len(objects) == expected_modules, 'La sala cambió; revisar alcance del atlas antes de hornear'
    unwrap(objects, scene)
    lighting(scene)
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    devices = []
    for device in prefs.devices:
        device.use = device.type == 'METAL'
        if device.use:
            devices.append(device.name)
    assert devices, 'No se encontró GPU Metal para Cycles'
    scene.render.engine = 'CYCLES'
    scene.cycles.device, scene.cycles.samples = 'GPU', SAMPLES
    scene.cycles.max_bounces, scene.cycles.diffuse_bounces = 8, 6
    scene.cycles.glossy_bounces, scene.cycles.transparent_max_bounces = 2, 8
    scene.cycles.bake_type = 'DIFFUSE'
    settings = scene.render.bake
    settings.use_pass_direct, settings.use_pass_indirect, settings.use_pass_color = True, True, False
    settings.margin, settings.margin_type = 16, 'EXTEND'
    settings.use_selected_to_active = False
    settings.use_clear = False  # Imagen nueva; no borrar lo horneado por los otros módulos.
    image = bpy.data.images.new('MUNAL_Lightmap', width=SIZE, height=SIZE,
                                alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    materials = {slot.material for obj in objects for slot in obj.material_slots if slot.material}
    for mat in materials:
        nodes = mat.node_tree.nodes
        for node in nodes:
            node.select = False
        node = nodes.new('ShaderNodeTexImage')
        node.name, node.label, node.image = 'Bake_Target', 'Diffuse Direct + Indirect ONLY', image
        node.select = True
        nodes.active = node
    select(objects)
    print(f'BAKE START: {SIZE}², {SAMPLES} samples, {devices}', flush=True)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT','INDIRECT'},
                        use_clear=False, uv_layer='LightmapUV')
    pixels = np.empty(SIZE*SIZE*4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgb = pixels.reshape(-1,4)[:,:3]
    assert np.isfinite(rgb).all() and float(rgb.max()) > .01, 'Bake vacío o inválido'
    # Conservar el HDR original y codificar PNG lineal normalizado sin recorte.
    peak = float(rgb.max())
    gain = max(1.0, peak)
    image.filepath_raw, image.file_format = str(EXR), 'OPEN_EXR'
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '32'
    image.save_render(str(EXR), scene=scene)
    rgb /= gain
    image.pixels.foreach_set(pixels)
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode, scene.render.image_settings.color_depth = 'RGB', '16'
    scene.render.image_settings.color_management = 'OVERRIDE'
    scene.render.image_settings.view_settings.view_transform = 'Raw'
    scene.render.image_settings.view_settings.look = 'None'
    scene.render.image_settings.view_settings.exposure = 0
    scene.render.image_settings.view_settings.gamma = 1
    image.save_render(str(PNG), scene=scene)
    # Comprobar que el PNG no recibió AgX/sRGB y que conserva 16 bits.
    assert PNG.read_bytes()[24] == 16
    check = bpy.data.images.load(str(PNG), check_existing=False)
    check.colorspace_settings.name = 'Non-Color'
    roundtrip = np.empty_like(pixels)
    check.pixels.foreach_get(roundtrip)
    error = float(np.max(np.abs(roundtrip.reshape(-1,4)[:,:3]-rgb)))
    assert error < .001, f'PNG no lineal o mal cuantizado: error {error}'
    bpy.data.images.remove(check)
    image.filepath_raw, image.file_format = str(PNG), 'PNG'
    image.source = 'FILE'
    image.reload()
    image.filepath_raw = bpy.path.relpath(str(PNG), start=str(OUTPUT.parent))
    scene['lightmap_gain'] = gain
    scene['lightmap_channel'] = 1
    for obj in objects:
        obj['lightmap'] = '/textures/' + PNG.name
        obj['lightmap_status'] = 'BAKED'
        obj['lightmap_gain'], obj['lightmap_channel'] = gain, 1
        obj.data.uv_layers[0].active_render = True
    collider = scene.objects[collider_name]
    select(export_objects if export_objects is not None else objects+[collider])
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True,
                             use_active_scene=True, export_texcoords=True, export_apply=True,
                             export_extras=True, export_animations=False, export_lights=False)
    collider.hide_set(True)
    data = GLB.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20+size])
    primitives = [p for mesh in document['meshes'] for p in mesh['primitives']]
    assert sum('TEXCOORD_1' in p['attributes'] and 'TEXCOORD_0' in p['attributes']
               for p in primitives) == (expected_uv_primitives if expected_uv_primitives is not None
                                        else len(objects)), 'Faltan UV0 o UV1 en el GLB'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
    report = dict(size=SIZE, samples=SAMPLES, gpu=devices, modules=len(objects),
                  uv_map='LightmapUV', uv_channel=1, angle_degrees=66, island_margin=.008,
                  bake_margin_px=16, passes=['DIRECT','INDIRECT'], color_pass=False,
                  png_color_space='linear', png_bits=16, lightmap_gain=gain,
                  hdr_peak=peak, png_roundtrip_max_error=error, uv_overlap_loops=0)
    REPORT.write_text(json.dumps(report, indent=2)+'\n')
    print('BAKE CHECK OK: '+json.dumps(report), flush=True)


def preview():
    """Render diagnóstico: únicamente albedo × lightmap; no luces en tiempo real."""
    bpy.ops.wm.open_mainfile(filepath=str(OUTPUT))
    scene = bpy.data.scenes['MUNAL_Hall']
    bpy.context.window.scene = scene
    image = bpy.data.images.load(str(PNG), check_existing=True)
    image.colorspace_settings.name = 'Non-Color'
    materials = {slot.material for obj in scene.objects if obj.type == 'MESH'
                 and not obj.get('collider') for slot in obj.material_slots if slot.material}
    for mat in materials:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        base = nodes.get('Principled BSDF').inputs['Base Color'].default_value[:]
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'LightmapUV'
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        links.new(uv.outputs['UV'], texture.inputs['Vector'])
        multiply = nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[2].default_value = base
        links.new(texture.outputs['Color'], multiply.inputs[1])
        emission = nodes.new('ShaderNodeEmission')
        emission.inputs['Strength'].default_value = scene['lightmap_gain']
        links.new(multiply.outputs[0], emission.inputs['Color'])
        links.new(emission.outputs[0], nodes.get('Material Output').inputs['Surface'])
    scene.cycles.device, scene.cycles.samples = 'CPU', 8
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.color_management = 'FOLLOW_SCENE'
    scene.render.image_settings.color_depth = '8'
    scene.render.resolution_percentage = 75
    scene.render.filepath = str(ROOT / 'assets/hall-baked-preview.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    bake()
