"""Sala MUNAL del siglo XIX; Blender 4.x+.

Requiere create_hall.py junto a este archivo. En Scripting: Open > Run Script.
CLI: blender -b --python-exit-code 1 --python scripts/create_exhibition_room.py
     -- --output assets/exhibition-room [--render] [--artworks 8|10]
Genera una escena independiente; nunca borra escenas ni sobrescribe archivos.
"""
import argparse
from math import isclose, pi
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from create_hall import box, material, mesh_object, pilaster

WIDTH, LENGTH, HEIGHT, WALL = 8.0, 16.0, 5.5, .30
DOOR_WIDTH, DOOR_HEIGHT = 1.4, 2.8
ART_WIDTH, ART_HEIGHT, ART_Z, GAP = 1.8, 1.2, 1.65, .02
BASE_HEIGHT, BASE_DEPTH, CORNICE = .60, .03, .35
FRAME_WIDTH, FRAME_DEPTH = .08, .06
MODULE = 4
WINDOW_Y = (-6.4, -2.4, 2.4, 6.4)
WINDOW_WIDTH, WINDOW_SILL, WINDOW_HEAD = 1.2, 1.0, 4.2
WINDOW_EMISSION = 3.5


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def planar_uv(obj):
    uv = obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        axes = (0,1) if abs(face.normal.z) > .5 else (
            (1,2) if abs(face.normal.x) > abs(face.normal.y) else (0,2))
        for i in face.loop_indices:
            co = obj.data.vertices[obj.data.loops[i].vertex_index].co
            uv.data[i].uv = (co[axes[0]],co[axes[1]])


def artwork(index, center, tangent, collection, canvas, wood, root):
    center, tangent, up = Vector(center), Vector(tangent), Vector((0,0,1))
    normal = tangent.cross(up)
    corners = [(-1,-1),(1,-1),(1,1),(-1,1)]
    vertices = [center+tangent*(x*ART_WIDTH/2)+up*(y*ART_HEIGHT/2) for x,y in corners]
    plane = mesh_object(f'Artwork_{index:02d}', vertices, [(0,1,2,3)], collection, canvas)
    uv = plane.data.uv_layers.new(name='UVMap')
    for loop, value in zip(uv.data, [(0,0),(1,0),(1,1),(0,1)]):
        loop.uv = value
    # Anillo rectangular cerrado: cuatro quads frontales, traseros y laterales.
    vertices = []
    for depth in [0,FRAME_DEPTH]:
        for width, height in [(ART_WIDTH+2*FRAME_WIDTH,ART_HEIGHT+2*FRAME_WIDTH),
                              (ART_WIDTH,ART_HEIGHT)]:
            vertices.extend(center+tangent*(x*width/2)+up*(y*height/2)+normal*depth
                            for x,y in corners)
    faces = []
    for i in range(4):
        j = (i+1)%4
        faces.extend([(i,j,j+4,i+4),(i+8,i+12,j+12,j+8),
                      (i,i+8,j+8,j),(i+4,j+4,j+12,i+12)])
    frame = mesh_object(f'Frame_{index:02d}', vertices, faces, collection, wood)
    bm = bmesh.new()
    bm.from_mesh(frame.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(frame.data)
    bm.free()
    frame.data.update()
    planar_uv(frame)
    for obj in [plane,frame]:
        obj.parent = root
    plane['wall_gap_m'] = GAP
    return plane, frame


def validate(room, collider, planes, frames, count):
    assert [m.name for m in room.data.materials] == [
        'Mat_Pared_VerdeMUNAL','Mat_Parquet_Suelo','Mat_Pilastra_Marfil','Mat_Vidrio_Ventana']
    assert len(planes) == len(frames) == count
    assert collider.name == 'Collider_Room'
    assert collider.users_collection[0].name == 'Physics' and collider.hide_render
    assert len(collider.data.vertices) == 8 and len(collider.data.polygons) == 6
    assert all(isclose(a,b,abs_tol=1e-6) for a,b in zip(collider.dimensions,(WIDTH,LENGTH,HEIGHT)))
    midpoint = Vector((0,0,HEIGHT/2))
    for face in collider.data.polygons:
        assert face.normal.dot(face.center-midpoint) < 0
    for name, z in [('Floor',0),('Ceiling',HEIGHT+WALL)]:
        group = room.vertex_groups[name].index
        verts = [v for v in room.data.vertices if any(g.group == group for g in v.groups)]
        assert verts and isclose(max(v.co.z for v in verts),z,abs_tol=1e-6)
    for name in ['Pilasters','Coffers','WindowGlass']:
        group = room.vertex_groups[name].index
        indices = {v.index for v in room.data.vertices if any(g.group == group for g in v.groups)}
        assert indices, name
        bm = bmesh.new()
        bm.from_mesh(room.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in indices], context='VERTS')
        assert all(edge.is_manifold and edge.is_contiguous for edge in bm.edges), name
        assert bm.calc_volume(signed=True) > 0, name
        assert all(face.material_index == (3 if name == 'WindowGlass' else 2) for face in bm.faces), name
        if name == 'Coffers':
            ceiling = room.vertex_groups['Ceiling'].index
            assert all(any(g.group == ceiling for g in room.data.vertices[i].groups) for i in indices)
        elif name == 'Pilasters':
            # Ni el fuste ni las molduras pueden invadir el volumen de los marcos existentes.
            bottom, top = ART_Z-ART_HEIGHT/2-FRAME_WIDTH, ART_Z+ART_HEIGHT/2+FRAME_WIDTH
            for face in bm.faces:
                if min(v.co.z for v in face.verts) <= top and max(v.co.z for v in face.verts) >= bottom:
                    assert all(abs(v.co.y-y) > ART_WIDTH/2+FRAME_WIDTH
                               for v in face.verts for y in [-4.8,0,4.8])
        else:
            assert len(bm.verts) == 8*8 and len(bm.faces) == 8*6
        bm.free()
    for obj in [room,collider,*planes,*frames]:
        assert obj.matrix_world == Matrix.Identity(4), obj.name
        assert all(len(face.vertices) in (3,4) for face in obj.data.polygons)
        if obj in planes:
            zs = [v.co.z for v in obj.data.vertices]
            assert isclose((min(zs)+max(zs))/2,ART_Z,abs_tol=1e-6)
            a,b,c,d = [v.co for v in obj.data.vertices]
            assert isclose((b-a).length,ART_WIDTH,abs_tol=1e-6)
            assert isclose((d-a).length,ART_HEIGHT,abs_tol=1e-6)
            center = sum((v.co for v in obj.data.vertices),Vector())/4
            hit, point, _, _ = room.ray_cast(center,-obj.data.polygons[0].normal,distance=.1)
            assert hit and isclose((point-center).length,GAP,abs_tol=1e-6)
        else:
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            assert all(edge.is_manifold and edge.is_contiguous for edge in bm.edges), obj.name
            assert bm.calc_volume(signed=True) * (-1 if obj == collider else 1) > 0
            bm.free()
    # Rayos atraviesan ambos vanos; dinteles, jambas y muros laterales sí obstruyen.
    for side in [-1,1]:
        direction = Vector((0,side,0))
        assert not room.ray_cast(Vector((0,0,1.4)),direction,distance=9)[0]
        for x,z in [(0,DOOR_HEIGHT+.01),(DOOR_WIDTH/2+.01,1.4),(-DOOR_WIDTH/2-.01,1.4)]:
            assert room.ray_cast(Vector((x,0,z)),direction,distance=9)[0]
        hit, point, _, _ = room.ray_cast(Vector((0,0,3)),Vector((side,0,0)),distance=5)
        assert hit and isclose(abs(point.x),WIDTH/2,abs_tol=1e-6)
    # El panel emisivo tapa ópticamente el vano; probar la estructura sin vidrio.
    glass = room.vertex_groups['WindowGlass'].index
    indices = {v.index for v in room.data.vertices if any(g.group == glass for g in v.groups)}
    bm = bmesh.new()
    bm.from_mesh(room.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index in indices], context='VERTS')
    structure = BVHTree.FromBMesh(bm)
    bm.free()
    middle = (WINDOW_SILL+WINDOW_HEAD)/2
    for side in [-1,1]:
        direction = Vector((side,0,0))
        for y in WINDOW_Y:
            for offset in [-WINDOW_WIDTH/2+.01,0,WINDOW_WIDTH/2-.01]:
                for z in [WINDOW_SILL+.01,middle,WINDOW_HEAD-.01]:
                    assert structure.ray_cast(Vector((0,y+offset,z)),direction,5)[0] is None
            for offset,z in [(-WINDOW_WIDTH/2-.01,middle),(WINDOW_WIDTH/2+.01,middle),
                             (0,WINDOW_SILL-.01),(0,WINDOW_HEAD+.01)]:
                point = structure.ray_cast(Vector((0,y+offset,z)),direction,5)[0]
                assert point is not None and isclose(abs(point.x),WIDTH/2,abs_tol=1e-6)
            hit,point,_,face = room.ray_cast(Vector((0,y,middle)),direction,distance=5)
            assert hit and room.data.polygons[face].material_index == 3
            assert isclose(abs(point.x),(WIDTH+WALL)/2-.005,abs_tol=1e-6)
    print(f'ROOM CHECK OK: 8×16×5.5 m; puertas 1.4×2.8; {count} cuadros; '
          '8 ventanas 1.2×3.2 m; cuatro materiales; pilastras y artesonado sólidos; matrices identidad; '
          'Collider_Room de 6 caras interiores.',flush=True)


def create_room(count=8):
    if count not in (8,10):
        raise ValueError('Elige 8 cuadros o 10 para cubrir ambos lados de cada puerta.')
    for name in ['Collider_Room','Architecture_Room']:
        if bpy.data.objects.get(name):
            raise ValueError(f'Ya existe {name}; ejecuta en un archivo nuevo.')
    if bpy.data.collections.get('Physics'):
        raise ValueError('Ya existe Physics; usa un archivo nuevo para mantener nombres exactos.')
    for name in ['Mat_Pared_VerdeMUNAL','Mat_Parquet_Suelo','Mat_Pilastra_Marfil','Mat_Vidrio_Ventana']:
        if bpy.data.materials.get(name):
            raise ValueError(f'Ya existe {name}; usa un archivo nuevo.')
    scene = bpy.data.scenes.new('MUNAL_ExhibitionRoom')
    bpy.context.window.scene = scene
    scene.unit_settings.system, scene.unit_settings.scale_length = 'METRIC', 1
    scene.cursor.location = (0,0,0)
    collections = []
    for name in ['Architecture','Artworks','Physics']:
        collection = bpy.data.collections.new(name)
        scene.collection.children.link(collection)
        collections.append(collection)
    architecture, artworks, physics = collections
    green = material('Mat_Pared_VerdeMUNAL',(.12,.22,.16),.82)
    parquet = material('Mat_Parquet_Suelo',(.24,.105,.045),.4)
    ivory = material('Mat_Pilastra_Marfil',(.78,.72,.60),.55)
    # #FFF4DE sRGB convertido a lineal para el shader; sin transmisión física.
    warm = tuple(((v+.055)/1.055)**2.4 for v in (1,244/255,222/255))
    glass = material('Mat_Vidrio_Ventana',warm,.4)
    shader = glass.node_tree.nodes['Principled BSDF']
    shader.inputs['Emission Color'].default_value = (*warm,1)
    shader.inputs['Emission Strength'].default_value = WINDOW_EMISSION
    shader.inputs['Transmission Weight'].default_value = 0
    canvas = material('Mat_Artwork_Placeholder',(.64,.59,.48),.9)
    wood = material('Mat_Frame_Wood',(.075,.026,.012),.28)
    parts = []

    def part(name, center, size, group='Walls', floor=False):
        obj = box(name,center,size,architecture)
        obj.data.materials.append(green)
        obj.data.materials.append(parquet)
        obj.data.materials.append(ivory)
        obj.data.materials.append(glass)
        for face in obj.data.polygons:
            face.material_index = int(floor)
        obj.vertex_groups.new(name=group).add(list(range(len(obj.data.vertices))),1,'REPLACE')
        planar_uv(obj)
        parts.append(obj)

    jamb = (WIDTH-DOOR_WIDTH)/2
    for side in [-1,1]:
        wall_x = side*(WIDTH+WALL)/2
        start = -LENGTH/2-WALL
        for index,y in enumerate(WINDOW_Y):
            left, right = y-WINDOW_WIDTH/2, y+WINDOW_WIDTH/2
            part(f'LongWall_{side}_Pier_{index}',(wall_x,(start+left)/2,HEIGHT/2),
                 (WALL,left-start,HEIGHT))
            part(f'WindowSill_{side}_{index}',(wall_x,y,WINDOW_SILL/2),
                 (WALL,WINDOW_WIDTH,WINDOW_SILL))
            part(f'WindowLintel_{side}_{index}',(wall_x,y,(WINDOW_HEAD+HEIGHT)/2),
                 (WALL,WINDOW_WIDTH,HEIGHT-WINDOW_HEAD))
            part(f'WindowGlass_{side}_{index}',(wall_x,y,(WINDOW_SILL+WINDOW_HEAD)/2),
                 (.01,WINDOW_WIDTH,WINDOW_HEAD-WINDOW_SILL),'WindowGlass')
            for face in parts[-1].data.polygons:
                face.material_index = 3
            start = right
        part(f'LongWall_{side}_Pier_End',(wall_x,(start+LENGTH/2+WALL)/2,HEIGHT/2),
             (WALL,LENGTH/2+WALL-start,HEIGHT))
        for x in [-1,1]:
            part(f'ShortWall_{side}_{x}',(x*(DOOR_WIDTH+jamb)/2,side*(LENGTH+WALL)/2,HEIGHT/2),
                 (jamb,WALL,HEIGHT))
        part(f'Lintel_{side}',(0,side*(LENGTH+WALL)/2,(HEIGHT+DOOR_HEIGHT)/2),
             (DOOR_WIDTH,WALL,HEIGHT-DOOR_HEIGHT))
        part(f'BaseboardLong_{side}',(side*(WIDTH-BASE_DEPTH)/2,0,BASE_HEIGHT/2),
             (BASE_DEPTH,LENGTH,BASE_HEIGHT),'Baseboard')
        for x in [-1,1]:
            length = jamb-BASE_DEPTH
            part(f'BaseboardShort_{side}_{x}',
                 (x*(DOOR_WIDTH+length)/2,side*(LENGTH-BASE_DEPTH)/2,BASE_HEIGHT/2),
                 (length,BASE_DEPTH,BASE_HEIGHT),'Baseboard')
    # Moldura escalonada de 0.35 m de alto y hasta 0.35 m de vuelo interior.
    for level, (bottom,top,depth) in enumerate([(HEIGHT-CORNICE,HEIGHT-.23,.12),
                                              (HEIGHT-.23,HEIGHT-.12,.23),
                                              (HEIGHT-.12,HEIGHT,.35)]):
        for side in [-1,1]:
            part(f'CorniceLong_{level}_{side}',(side*(WIDTH-depth)/2,0,(top+bottom)/2),
                 (depth,LENGTH,top-bottom),'Cornice')
            part(f'CorniceShort_{level}_{side}',(0,side*(LENGTH-depth)/2,(top+bottom)/2),
                 (WIDTH-2*depth,depth,top-bottom),'Cornice')
    part('Floor',(0,0,-.10),(WIDTH,LENGTH,.20),'Floor',floor=True)
    part('Ceiling',(0,0,HEIGHT+WALL/2),(WIDTH+2*WALL,LENGTH+2*WALL,WALL),'Ceiling')
    for face in parts[-1].data.polygons:
        face.material_index = 2

    decorations = []
    for side in [-1,1]:
        # Paños macizos: las posiciones anteriores ±6/±2 invadían las ventanas.
        for y in [-7.5,-1.4,1.4,7.5]:
            obj = pilaster(f'Pilaster_{side}_{y}', (side*WIDTH/2,y,0), side*pi/2,
                           architecture, ivory, height=HEIGHT)
            # Ancho local reducido: fuste de .41 m deja libres los marcos en Y=±4.8.
            for vertex in obj.data.vertices:
                vertex.co.y = y+(vertex.co.y-y)*.5
            obj.vertex_groups.new(name='Pilasters').add(list(range(len(obj.data.vertices))),1,'REPLACE')
            decorations.append(obj)

    # Patrón de hall: 2×4 casetones, profundidad escalada de .60 a .4125 m.
    scale = HEIGHT/8.0
    for offset, width, height in [(-.50,.50,.20),(-.32,.36,.16),(-.12,.24,.24)]:
        z = HEIGHT+offset*scale
        for x in range(-int(WIDTH/2), int(WIDTH/2)+1, MODULE):
            decorations.append(box(f'Coffer_X{x}_{z}', (x,0,z),
                                   (width,LENGTH,height*scale),architecture,ivory))
        for y in range(-int(LENGTH/2), int(LENGTH/2)+1, MODULE):
            for x in range(-int(WIDTH/2)+MODULE//2, int(WIDTH/2), MODULE):
                decorations.append(box(f'Coffer_Y{y}_X{x}_{z}', (x,y,z),
                                       (MODULE-width,width,height*scale),architecture,ivory))
    for obj in decorations:
        if obj.name.startswith('Coffer_'):
            for name in ['Ceiling','Coffers']:
                obj.vertex_groups.new(name=name).add(list(range(len(obj.data.vertices))),1,'REPLACE')
        planar_uv(obj)
        parts.append(obj)
    select(parts)
    bpy.ops.object.join()
    room = bpy.context.object
    room.name, room.data.name = 'Architecture_Room', 'Architecture_Room_Mesh'
    room['dimensions_interior_m'] = (WIDTH,LENGTH,HEIGHT)
    room['lightmap_status'] = 'NOT_BAKED_GEOMETRY_CHANGED'
    placements = []
    for side in [-1,1]:
        placements += [((side*(WIDTH/2-GAP),y,ART_Z),(0,-side,0)) for y in [-4.8,0,4.8]]
    for side in [-1,1]:
        xs = [-1,1] if count == 10 else [-side]
        placements += [((x*(DOOR_WIDTH+jamb)/2,side*(LENGTH/2-GAP),ART_Z),(side,0,0)) for x in xs]
    planes, frames = [], []
    for i, (center,tangent) in enumerate(placements,1):
        plane,frame = artwork(i,center,tangent,artworks,canvas,wood,room)
        planes.append(plane)
        frames.append(frame)
    collider = box('Collider_Room',(0,0,HEIGHT/2),(WIDTH,LENGTH,HEIGHT),physics)
    bm = bmesh.new()
    bm.from_mesh(collider.data)
    bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(collider.data)
    bm.free()
    collider.data.update()
    collider.hide_render, collider.display_type = True, 'WIRE'
    collider['collider'], collider['type'] = True, 'trimesh'
    collider['closed_doorways'] = True
    meshes = [room,collider,*planes,*frames]
    select(meshes)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.context.view_layer.update()
    validate(room,collider,planes,frames,count)
    collider.hide_set(True)
    return scene, meshes


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--render',action='store_true')
    parser.add_argument('--artworks',type=int,choices=[8,10],default=8)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.output:
        args.output = args.output.resolve()
        for ext in ['.blend','.glb','.png']:
            if args.output.with_suffix(ext).exists():
                raise FileExistsError(args.output.with_suffix(ext))
        args.output.parent.mkdir(parents=True,exist_ok=True)
    scene, meshes = create_room(args.artworks)
    if args.output:
        select(meshes)
        bpy.ops.export_scene.gltf(filepath=str(args.output.with_suffix('.glb')),
                                 export_format='GLB',use_selection=True,use_active_scene=True,
                                 export_apply=True,export_extras=True,export_animations=False)
        bpy.data.objects['Collider_Room'].hide_set(True)
        camera_data = bpy.data.cameras.new('Room_Camera')
        camera = bpy.data.objects.new(camera_data.name,camera_data)
        scene.collection.objects.link(camera)
        camera.location = (0,-6.7,1.8)
        camera.rotation_euler = (Vector((0,1.5,2.3))-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.lens = 19
        scene.camera = camera
        for y in [-5,0,5]:
            data = bpy.data.lights.new(f'Room_PreviewLight_{y}','AREA')
            data.energy, data.shape, data.size, data.size_y = 900,'RECTANGLE',4,3
            lamp = bpy.data.objects.new(data.name,data)
            scene.collection.objects.link(lamp)
            lamp.location = (0,y,5.0)
        scene.world = bpy.data.worlds.new('Room_World')
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .15
        scene.render.engine, scene.cycles.samples = 'CYCLES',32
        scene.cycles.use_denoising = True
        scene.render.resolution_x,scene.render.resolution_y = 1200,800
        scene.render.resolution_percentage = 100
        bpy.ops.object.select_all(action='DESELECT')
        for area in bpy.context.screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
        if args.render:
            scene.render.filepath = str(args.output.with_suffix('.png'))
            bpy.ops.render.render(write_still=True)
