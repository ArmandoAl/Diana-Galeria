import { Matrix3, Mesh, Raycaster, Vector3 } from 'three'
import type { Intersection, Object3D } from 'three'
import type { ArtworkData } from '../types/gallery.ts'

/** Rayo central contra la escena visual: paredes y marcos también ocluyen los cuadros. */
export class ArtworkFocus {
  private readonly raycaster = new Raycaster()
  private readonly hits: Intersection[] = []
  private readonly meshes: Mesh[] = []
  private readonly artworks = new Map<Object3D, ArtworkData>()
  private readonly normal = new Vector3()
  private readonly normalMatrix = new Matrix3()

  constructor(scene: Object3D, data: readonly ArtworkData[]) {
    const assigned = new Set<number>()
    scene.traverse((object) => {
      if (!(object instanceof Mesh) || object.name === 'Collider_Room'
        || object.userData.collider === true) return
      let ancestor: Object3D | null = object
      while (ancestor) {
        if (!ancestor.visible) return
        ancestor = ancestor.parent
      }
      this.meshes.push(object)
      const match = /^Artwork_(\d{2})$/.exec(object.name)
      const index: unknown = object.userData.slotIndex ?? (match ? Number(match[1]) - 1 : null)
      const artwork = data.find((item) => item.slotIndex === index)
      if (artwork) {
        this.artworks.set(object, artwork)
        assigned.add(artwork.slotIndex)
      }
    })
    if (assigned.size !== data.length) {
      throw new Error('Faltan placas Artwork_01–Artwork_08 o metadatos slotIndex en el GLB.')
    }
    this.raycaster.far = 2
  }

  find(origin: Vector3, direction: Vector3): ArtworkData | null {
    this.raycaster.set(origin, direction)
    this.hits.length = 0
    this.raycaster.intersectObjects(this.meshes, false, this.hits)
    const hit = this.hits[0]
    if (!hit || hit.distance >= 2 || !hit.face) return null
    const artwork = this.artworks.get(hit.object)
    if (!artwork) return null
    this.normalMatrix.getNormalMatrix(hit.object.matrixWorld)
    this.normal.copy(hit.face.normal).applyNormalMatrix(this.normalMatrix)
    return this.normal.dot(direction) < -0.25 ? artwork : null
  }
}
