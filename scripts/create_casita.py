"""Build the editable first-pass replica of Diana's painted wooden house."""
import bpy
from math import radians
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLEND = ROOT / 'assets/casita-madriguera.blend'
GLB = ROOT / 'public/models/casita-madriguera.glb'

# Approximate 80 cm overall height from the owner's estimate and photographs.
W, D, EAVE, RIDGE = .58, .52, .55, .75

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != 'Collection':
        bpy.data.collections.remove(collection)

def material(name, color, roughness=.75):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat

sage = material('Pintura verde salvia envejecida', (.24, .29, .19))
wood = material('Madera cálida pintada y barnizada', (.30, .105, .038), .43)
edge = material('Canto de madera oscura', (.13, .045, .019), .5)
frame = material('Moldura madera rojiza', (.38, .14, .055), .35)

def photo_material(name, path):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    output = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    shader = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    image = bpy.data.images.load(str(path), check_existing=True)
    image.pack()
    texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.interpolation = 'Linear'
    mat.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = .82
    mat.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    return mat

def cube(name, loc, scale, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Cantos suavizados de carpintería', 'BEVEL')
        mod.width, mod.segments = bevel, 2
        obj.modifiers.new('Normales de caras', 'WEIGHTED_NORMAL')
    return obj

parts = []
# Four thin painted panels around a simple wooden carcass.
parts += [cube('Cuerpo interior', (0, 0, EAVE / 2), (W, D, EAVE), edge)]
for name, center, size in [
    ('Pintura_Front', (0, -D/2-.006, EAVE/2), (W-.035, .012, EAVE-.045)),
    ('Pintura_Back', (0, D/2+.006, EAVE/2), (W-.035, .012, EAVE-.045)),
    ('Pintura_Left', (-W/2-.006, 0, EAVE/2), (.012, D-.035, EAVE-.045)),
    ('Pintura_Right', (W/2+.006, 0, EAVE/2), (.012, D-.035, EAVE-.045)),
]:
    panel = cube(name, center, size, sage, .006)
    parts.append(panel)

# Closed triangular gable ends keep the roof from reading as an open canopy.
for x in [-W/2-.004, W/2+.004]:
    mesh = bpy.data.meshes.new('Testero triangular mesh')
    mesh.from_pydata([(x, -D/2, EAVE), (x, D/2, EAVE), (x, 0, RIDGE)], [], [(0, 1, 2)])
    mesh.materials.append(sage)
    gable = bpy.data.objects.new(f'Testero triangular {x}', mesh)
    bpy.context.collection.objects.link(gable)
    parts.append(gable)

# The four source photos give each face a faithful first-pass image; swap these
# packed textures for straight-on Gemini crops later without changing geometry.
face_images = {
    'Lienzo_Frontal': ('frente-retrato.jpg', (0, -D/2-.021, .315), .39, .43, 'front'),
    'Lienzo_Trasero': ('atras-retrato.jpg', (0, D/2+.021, .315), .39, .43, 'back'),
    'Lienzo_Izquierdo': ('izquierda-retrato.jpg', (-W/2-.021, 0, .315), .34, .43, 'left'),
    'Lienzo_Derecho': ('derecha-retrato.jpg', (W/2+.021, 0, .315), .34, .43, 'right'),
}
for name, (filename, center, width, height, side) in face_images.items():
    x, y, z = center
    if side == 'back':
        corners = [(x+width/2, y, z-height/2), (x-width/2, y, z-height/2),
                   (x-width/2, y, z+height/2), (x+width/2, y, z+height/2)]
    elif side == 'front':
        corners = [(x-width/2, y, z-height/2), (x+width/2, y, z-height/2),
                   (x+width/2, y, z+height/2), (x-width/2, y, z+height/2)]
    elif side == 'left':
        corners = [(x, y+width/2, z-height/2), (x, y-width/2, z-height/2),
                   (x, y-width/2, z+height/2), (x, y+width/2, z+height/2)]
    else:
        corners = [(x, y-width/2, z-height/2), (x, y+width/2, z-height/2),
                   (x, y+width/2, z+height/2), (x, y-width/2, z+height/2)]
    mesh = bpy.data.meshes.new(name + ' mesh')
    mesh.from_pydata(corners, [], [(0, 1, 2, 3)])
    mesh.materials.append(photo_material(name + ' fotografía temporal', ROOT / 'assets/casita-textures' / filename))
    uv = mesh.uv_layers.new(name='UVMap')
    for loop, coord in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop.uv = coord
    picture = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(picture)
    parts.append(picture)

# Four corner battens and lower plinth echo the visible joinery.
for x in [-1, 1]:
    for y in [-1, 1]:
        parts.append(cube(f'Esquinero_{x}_{y}', (x*(W/2-.012), y*(D/2-.012), EAVE/2),
                          (.024, .024, EAVE), frame, .003))
parts.append(cube('Zócalo frontal', (0, -D/2-.012, .025), (W, .024, .05), wood, .004))
parts.append(cube('Zócalo posterior', (0, D/2+.012, .025), (W, .024, .05), wood, .004))
parts.append(cube('Zócalo izquierdo', (-W/2-.012, 0, .025), (.024, D, .05), wood, .004))
parts.append(cube('Zócalo derecho', (W/2+.012, 0, .025), (.024, D, .05), wood, .004))

# Two shallow roof boards with eaves and a narrow ridge cap.
pitch = __import__('math').atan2(RIDGE-EAVE, D/2)
slant = ((D/2)**2 + (RIDGE-EAVE)**2)**.5
for side in [-1, 1]:
    roof = cube(f'Faldón de madera {side}', (0, side*D/4, (EAVE+RIDGE)/2),
                (W+.09, slant+.07, .035), wood, .008)
    roof.rotation_euler.x = -side*pitch
    parts.append(roof)
    fascia = cube(f'Fascia de alero {side}', (0, side*(D/2+.035), EAVE-.006),
                  (W+.10, .035, .045), frame, .006)
    fascia.rotation_euler.x = -side*pitch
    parts.append(fascia)
parts.append(cube('Cumbrera', (0, 0, RIDGE+.012), (W+.10, .035, .035), frame, .01))

# The original roof writing stays unmodeled until a legible crop or transcription is available.
label = bpy.data.objects.new('Texto techo pendiente de transcripción', None)
bpy.context.collection.objects.link(label)
label.location = (0, 0, RIDGE+.04)
label['note'] = 'Añadir el poema manuscrito cuando llegue una imagen cenital recta o su transcripción.'

root = bpy.data.objects.new('Casita_Madriguera_Interactiva', None)
bpy.context.collection.objects.link(root)
root['approximate_dimensions_m'] = (W, D, RIDGE)
root['approximation_note'] = 'Escala estimada a partir de fotos y altura indicada de 0.80 m.'
root['interactive_house'] = True
for obj in parts:
    obj.parent = root
label.parent = root

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = 1200, 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(ROOT / 'assets/casita-madriguera-preview.png')
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = -.7
scene.world.color = (.16, .16, .16)

# A useful editable camera and soft lights are included in the .blend.
bpy.ops.object.camera_add(location=(1.35, -1.75, 1.05))
camera = bpy.context.object
camera.name = 'Cámara de revisión'
camera.rotation_euler = ( __import__('mathutils').Vector((0, 0, .39)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 55
scene.camera = camera
for name, location, power, size in [
    ('Luz principal', (1.0, -1.2, 1.7), 60, 1.2),
    ('Relleno', (-1.1, -.1, 1.0), 35, 1.0),
]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy, light.data.shape, light.data.size = power, 'DISK', size
    light.rotation_euler = (__import__('mathutils').Vector((0, 0, .38)) - light.location).to_track_quat('-Z', 'Y').to_euler()

BLEND.parent.mkdir(parents=True, exist_ok=True)
GLB.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=False,
                          export_apply=True, export_image_format='AUTO')
bpy.ops.render.render(write_still=True)
print(f'Created {BLEND} and {GLB}', flush=True)
