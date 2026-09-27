import { DoubleSide, Group, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace, Vector3 } from 'three'
import type { BufferGeometry, Material, Object3D, Texture } from 'three'
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { GalleryMount } from '../types/gallery.ts'
import { MAX_ROOM_CAPACITY, ROOM_PALETTES } from '../data/galleryRooms.ts'
import { computeAdaptiveArtworkLayout } from './wallLayout.ts'

/** Copias propias: ni materiales ni texturas de la caché de useGLTF/useTexture se mutan. */
export function prepareGallery(source: Object3D, sourceLightmap: Texture,
  mounts: readonly GalleryMount[], palette: { wall: string; partition: string } = ROOM_PALETTES[0]) {
    const scene = new Group()
    scene.add(source.clone(true))
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  const geometries = new Set<BufferGeometry>()
  const dispose = () => {
    for (const material of materials) material.dispose()
    for (const texture of textures) texture.dispose()
    for (const geometry of geometries) { disposeBoundsTree.call(geometry); geometry.dispose() }
  }
  try {
    if (mounts.length > MAX_ROOM_CAPACITY) {
      throw new Error('Cada sala admite hasta 14 obras, con una imagen por obra.')
    }
    if (new Set(mounts.map((mount) => mount.slotIndex)).size !== mounts.length
      || mounts.some((mount) => !Number.isInteger(mount.slotIndex) || mount.slotIndex < 0 || mount.slotIndex >= MAX_ROOM_CAPACITY)) {
      throw new Error('Los montajes de una sala deben ser únicos y estar entre 0 y 13.')
    }
    const lightmap = sourceLightmap.clone()
    textures.add(lightmap)
    lightmap.channel = 1
    lightmap.flipY = false
    lightmap.colorSpace = LinearSRGBColorSpace
    lightmap.needsUpdate = true
    const slots = new Set<number>()
    let floorFound = false
    scene.traverse((object) => {
      if (!(object instanceof Mesh) || object.name === 'Collider_Room') return
      const match = /^Artwork_(\d{2})$/.exec(object.name)
      const frameMatch = /^Frame_(\d{2})$/.exec(object.name)
      const slot: unknown = object.userData.slotIndex ?? (match || frameMatch ? Number((match || frameMatch)![1]) - 1 : null)
      const index = mounts.findIndex((mount) => mount.slotIndex === slot)
      if ((match || frameMatch) && index < 0) { object.visible = false; return }
      if ((match || frameMatch) && index >= 0) {
        object.visible = true
        const plane = scene.getObjectByName(`Artwork_${String(Number(slot) + 1).padStart(2, '0')}`) as Mesh
        const sourceGeometry = object.geometry.clone()
        sourceGeometry.computeBoundingBox()
        const center = sourceGeometry.boundingBox!.getCenter(new Vector3())
        const size = sourceGeometry.boundingBox!.getSize(new Vector3())
        const image = mounts[index].texture.image as { width?: number; height?: number } | undefined
        const width = Number(plane.userData.display_width ?? 1.8)
        const height = Number(plane.userData.display_height ?? 1.2)
        const aspect = image?.width && image?.height ? image.width / image.height : width / height
        const fit = computeAdaptiveArtworkLayout(Number(slot), center, size, aspect, width, height)
        object.geometry = sourceGeometry.translate(-center.x, -center.y, -center.z)
          .scale(fit.scale.x, fit.scale.y, fit.scale.z).translate(fit.targetCenter.x, fit.targetCenter.y, fit.targetCenter.z)
        geometries.add(object.geometry)
      }
      if (index >= 0 && !frameMatch) {
        if (slots.has(mounts[index].slotIndex)) throw new Error(`Placa duplicada: slot ${String(slot)}.`)
        slots.add(mounts[index].slotIndex)
        if (!object.geometry.getAttribute('uv')) throw new Error(`${object.name} necesita TEXCOORD_0.`)
        const mount = mounts[index]
        const map = mount.texture.clone()
        textures.add(map)
        map.colorSpace = SRGBColorSpace
        map.flipY = false
        map.channel = 0
        map.needsUpdate = true
        // Exposición de sala uniforme para conservar legibles los colores de las obras.
        object.material = new MeshBasicMaterial({ map, color: '#eee9e1', ...(mount.type === 'artwork' && mount.data.id === 'obra-03-b' && { side: DoubleSide }) })
        materials.add(object.material)
        return
      }
      const original = Array.isArray(object.material) ? object.material : [object.material]
      const next = original.map((material) => {
        const frame = /^Frame_\d+/.test(object.name) || /marco|frame/i.test(material.name)
        const garden = object.name.startsWith('Garden_')
        const glass = object.name.startsWith('Window_Glass_')
        const copy = garden ? new MeshBasicMaterial({ map: (material as MeshStandardMaterial).map ?? (material as MeshStandardMaterial).emissiveMap, side: DoubleSide })
          : glass ? new MeshPhysicalMaterial({ color: '#dce9ec', transparent: true, opacity: .18,
            roughness: .08, metalness: .1, transmission: .15, thickness: .008, depthWrite: false, side: DoubleSide })
          : frame ? new MeshStandardMaterial({ color: '#b99a61', metalness: .55, roughness: .38, envMapIntensity: 2.2 }) : material.clone()
        materials.add(copy)
        if (copy instanceof MeshStandardMaterial && !frame && !glass) {
          if (!object.geometry.getAttribute('uv1')) {
            throw new Error(`${object.name}: falta TEXCOORD_1 (uv1). Exporta el atlas LightmapUV; no copies UV0.`)
          }
          copy.lightMap = lightmap
          // Bake Diffuse de Cycles = E/pi. Recuperar irradiancia y cualquier normalización HDR.
          let owner: Object3D | null = object
          while (owner && owner.userData.lightmap_gain === undefined) owner = owner.parent
          const gain: unknown = owner?.userData.lightmap_gain ?? source.userData.lightmap_gain ?? 1
          if (typeof gain !== 'number' || !Number.isFinite(gain) || gain <= 0) throw new Error('lightmap_gain inválido.')
          copy.lightMapIntensity = Math.PI * gain
          copy.envMapIntensity = .12
          if (material.name === 'Mat_Pared_VerdeMUNAL') copy.color.set(palette.wall)
          if (/Mat_Mampara_/.test(material.name)) copy.color.set(palette.partition)
          if (/parquet|suelo|floor/i.test(`${material.name} ${object.name}`)) {
            copy.roughness = 0.25
            copy.metalness = 0.05
            floorFound = true
          }
        }
        return copy
      })
      object.material = Array.isArray(object.material) ? next : next[0]
    })
    if (slots.size !== mounts.length) throw new Error('El GLB no contiene todos los montajes de esta sala.')
    if (!floorFound) throw new Error('No se identifica el parquet: usa Mat_Parquet_Suelo o un nombre Floor/Parquet.')
    const collider = scene.getObjectByName('Collider_Room')
    if (!(collider instanceof Mesh)) throw new Error('Falta la malla Collider_Room en el GLB.')
    scene.updateMatrixWorld(true)
    const geometry = collider.geometry.clone().applyMatrix4(collider.matrixWorld)
    geometries.add(geometry)
    collider.geometry = geometry
    collider.removeFromParent()
    collider.position.set(0, 0, 0)
    collider.rotation.set(0, 0, 0)
    collider.scale.set(1, 1, 1)
    collider.matrixAutoUpdate = true
    scene.add(collider)
    collider.visible = false
    scene.updateMatrixWorld(true)
    geometry.computeBoundsTree = computeBoundsTree
    geometry.computeBoundsTree({ targetLeafSize: 8 })
    return { scene, collider, dispose }
  } catch (error) { dispose(); throw error }
}
