import { Matrix3, Mesh, Raycaster, Vector3 } from 'three'
import type { Intersection, Object3D } from 'three'
import type { ArtworkData, GalleryMount } from '../types/gallery.ts'

/** Rayo central contra la escena visual: paredes y marcos también ocluyen los cuadros. */
export class ArtworkFocus {
  private readonly raycaster = new Raycaster()
  private readonly hits: Intersection[] = []
  private readonly meshes: Mesh[] = []
  private readonly houseMeshes: Mesh[] = []
  private readonly artworks = new Map<Object3D, ArtworkData>()
  private readonly normal = new Vector3()
  private readonly normalMatrix = new Matrix3()

  constructor(scene: Object3D, mounts: readonly GalleryMount[]) {
    const data = mounts.filter((mount) => mount.type === 'artwork').map((mount) => mount.data)
    const assigned = new Set<number>()
    scene.traverse((object) => {
      if (!(object instanceof Mesh) || object.name === 'Collider_Room'
        || object.userData.collider === true) return
      let ancestor: Object3D | null = object
      let belongsToHouse = false
      while (ancestor) {
        if (!ancestor.visible) return
        if (ancestor.userData.interactive_house === true || ancestor.name === 'Casita_Madriguera_Interactiva') {
          belongsToHouse = true
        }
        ancestor = ancestor.parent
      }
      this.meshes.push(object)
      if (belongsToHouse) this.houseMeshes.push(object)
      const match = /^Artwork_(\d{2})$/.exec(object.name)
      const index: unknown = object.userData.slotIndex ?? (match ? Number(match[1]) - 1 : null)
      const artwork = data.find((item) => item.slotIndex === index)
      if (artwork) {
        this.artworks.set(object, artwork)
        assigned.add(artwork.slotIndex)
      }
    })
    if (assigned.size !== data.length) {
      throw new Error('Faltan placas o metadatos slotIndex para las obras de esta sala.')
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

  findHouse(origin: Vector3, direction: Vector3): boolean {
    if (!this.houseMeshes.length) return false
    this.raycaster.set(origin, direction)
    this.hits.length = 0
    this.raycaster.intersectObjects(this.houseMeshes, false, this.hits)
    const hit = this.hits[0]
    return !!hit && hit.distance < 2
  }

  findDoor(origin: Vector3, direction: Vector3): -1 | 1 | null {
    this.raycaster.set(origin, direction)
    this.hits.length = 0
    this.raycaster.intersectObjects(this.meshes, false, this.hits)
    const hit = this.hits[0]
    if (!hit || hit.distance >= 2) return null
    let object: Object3D | null = hit.object
    while (object) {
      const value: unknown = object.userData.doorDirection
      if (value === -1 || value === 1) return value
      object = object.parent
    }
    return null
  }
}
