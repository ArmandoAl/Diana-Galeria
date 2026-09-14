import { Group, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three'
import type { BufferGeometry, Material, Object3D, Texture } from 'three'
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { ArtworkData } from '../types/gallery.ts'

/** Copias propias: ni materiales ni texturas de la caché de useGLTF/useTexture se mutan. */
export function prepareGallery(source: Object3D, sourceLightmap: Texture,
  artworks: readonly ArtworkData[], images: readonly Texture[]) {
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
    if (artworks.length !== 8 || images.length !== 8) throw new Error('Se requieren ocho obras y ocho imágenes.')
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
      const slot: unknown = object.userData.slotIndex ?? (match ? Number(match[1]) - 1 : null)
      const index = artworks.findIndex((artwork) => artwork.slotIndex === slot)
      if (index >= 0) {
        if (slots.has(artworks[index].slotIndex)) throw new Error(`Placa duplicada: slot ${String(slot)}.`)
        slots.add(artworks[index].slotIndex)
        if (!object.geometry.getAttribute('uv')) throw new Error(`${object.name} necesita TEXCOORD_0.`)
        const map = images[index].clone()
        textures.add(map)
        map.colorSpace = SRGBColorSpace
        map.flipY = false
        map.channel = 0
        map.needsUpdate = true
        object.material = new MeshBasicMaterial({ map })
        materials.add(object.material)
        return
      }
      const original = Array.isArray(object.material) ? object.material : [object.material]
      const next = original.map((material) => {
        const frame = /^Frame_\d+/.test(object.name) || /marco|frame/i.test(material.name)
        const copy = frame ? new MeshStandardMaterial({ color: '#d4af37', metalness: 0.85, roughness: 0.3 }) : material.clone()
        materials.add(copy)
        if (copy instanceof MeshStandardMaterial && !frame) {
          if (!object.geometry.getAttribute('uv1')) {
            throw new Error(`${object.name}: falta TEXCOORD_1 (uv1). Exporta el atlas LightmapUV; no copies UV0.`)
          }
          copy.lightMap = lightmap
          // Bake Diffuse de Cycles = E/pi. Recuperar irradiancia y cualquier normalización HDR.
          const gain: unknown = object.userData.lightmap_gain ?? source.userData.lightmap_gain ?? 1
          if (typeof gain !== 'number' || !Number.isFinite(gain) || gain <= 0) throw new Error('lightmap_gain inválido.')
          copy.lightMapIntensity = Math.PI * gain
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
    if (slots.size !== 8) throw new Error('El GLB debe incluir Artwork_01–Artwork_08 o slotIndex 0–7.')
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
