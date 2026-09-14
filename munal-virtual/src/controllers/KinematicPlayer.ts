import { Box3, Line3, Matrix4, Mesh, Vector3 } from 'three'
import type { BufferGeometry, Object3D } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { ExtendedTriangle } from 'three-mesh-bvh'

const STEP = 1 / 120
const CONTACT_EPSILON = 1e-5

/** Cápsula estática contra una malla estática. Y arriba; position = centro de los pies. */
export class KinematicPlayer {
  readonly radius = 0.35
  readonly height = 1.75
  readonly eyeHeight = 1.65
  readonly position = new Vector3()
  readonly velocity = new Vector3()
  readonly tempVector = new Vector3()
  readonly tempLine = new Line3()
  readonly tempBox = new Box3()
  readonly collider: Mesh
  readonly geometry: BufferGeometry
  readonly bvh: MeshBVH
  isGrounded = false
  speed = 0

  private readonly trianglePoint = new Vector3()
  private readonly capsulePoint = new Vector3()
  private readonly previousPosition = new Vector3()
  private readonly desiredVelocity = new Vector3()
  private accumulator = 0
  private corrected = false
  private readonly ownsGeometry: boolean

  // Los callbacks y auxiliares se crean una sola vez, no por cuadro/triángulo.
  private readonly callbacks = {
    intersectsBounds: (box: Box3) => box.intersectsBox(this.tempBox),
    intersectsTriangle: (triangle: ExtendedTriangle) => {
      const distance = triangle.closestPointToSegment(
        this.tempLine, this.trianglePoint, this.capsulePoint,
      )
      if (distance > this.radius + CONTACT_EPSILON) return false

      this.tempVector.subVectors(this.capsulePoint, this.trianglePoint)
      if (distance > 1e-9) this.tempVector.multiplyScalar(1 / distance)
      else triangle.getNormal(this.tempVector) // Collider_Room tiene normales interiores.

      if (this.tempVector.y > 0.65 && this.velocity.y <= 0) this.isGrounded = true
      const intoSurface = this.velocity.dot(this.tempVector)
      if (intoSurface < 0) this.velocity.addScaledVector(this.tempVector, -intoSurface)

      const penetration = this.radius - distance
      if (penetration > 0) {
        this.tempLine.start.addScaledVector(this.tempVector, penetration)
        this.tempLine.end.addScaledVector(this.tempVector, penetration)
        this.updateBounds()
        this.corrected = true
      }
      return false // Continuar: una esquina puede tener varios contactos.
    },
  }

  constructor(scene: Object3D, spawn: Vector3 = new Vector3(), collider?: Mesh) {
    const candidate = collider ?? scene.getObjectByName('Collider_Room')
    if (!(candidate instanceof Mesh) || !candidate.geometry.getAttribute('position')) {
      throw new Error('El GLB debe contener una malla Collider_Room con geometría.')
    }
    scene.updateWorldMatrix(true, true)
    this.collider = candidate
    // Una copia en espacio mundial soporta padres rotados y escalas no uniformes.
    // Nunca modificar la geometría compartida por useGLTF ni parchar Mesh.prototype.
    const existingTree = candidate.geometry.boundsTree
    const reusable = existingTree instanceof MeshBVH && candidate.matrixWorld.equals(new Matrix4())
    this.ownsGeometry = !reusable
    this.geometry = reusable ? candidate.geometry : candidate.geometry.clone().applyMatrix4(candidate.matrixWorld)
    this.geometry.computeBoundingBox()
    const bounds = this.geometry.boundingBox!
    if (![spawn.x, spawn.y, spawn.z].every(Number.isFinite)
      || spawn.x - this.radius < bounds.min.x - CONTACT_EPSILON
      || spawn.x + this.radius > bounds.max.x + CONTACT_EPSILON
      || spawn.z - this.radius < bounds.min.z - CONTACT_EPSILON
      || spawn.z + this.radius > bounds.max.z + CONTACT_EPSILON
      || spawn.y < bounds.min.y - CONTACT_EPSILON
      || spawn.y + this.height > bounds.max.y + CONTACT_EPSILON) {
      if (this.ownsGeometry) this.geometry.dispose()
      throw new Error('El punto de aparición no cabe dentro de Collider_Room.')
    }
    this.bvh = reusable && existingTree instanceof MeshBVH ? existingTree : new MeshBVH(this.geometry, { targetLeafSize: 8 })
    this.position.copy(spawn)
  }

  private updateBounds() {
    this.tempBox.makeEmpty()
    this.tempBox.expandByPoint(this.tempLine.start)
    this.tempBox.expandByPoint(this.tempLine.end)
    this.tempBox.expandByScalar(this.radius + CONTACT_EPSILON)
  }

  /** direction: dirección horizontal mundial; su longitud no aumenta la rapidez diagonal. */
  update(delta: number, direction: Vector3, running = false) {
    if (!Number.isFinite(delta) || delta <= 0) return
    this.desiredVelocity.set(direction.x, 0, direction.z)
    if (!Number.isFinite(this.desiredVelocity.lengthSq())) this.desiredVelocity.set(0, 0, 0)
    this.desiredVelocity.clampLength(0, 1).multiplyScalar(running ? 3.4 : 2.2)
    // ponytail: colisión discreta a 120 Hz y velocidad limitada; añadir barrido continuo
    // si se incorporan teletransportes, plataformas móviles o velocidades mayores.
    this.accumulator += Math.min(delta, 0.1) // No recuperar minutos tras cambiar de pestaña.
    let elapsed = 0
    let distance = 0
    while (this.accumulator + 1e-10 >= STEP) {
      this.accumulator = Math.max(0, this.accumulator - STEP)
      this.previousPosition.copy(this.position)
      if (this.desiredVelocity.lengthSq() > 0) {
        this.tempVector.set(
          this.desiredVelocity.x - this.velocity.x, 0,
          this.desiredVelocity.z - this.velocity.z,
        ).clampLength(0, (this.isGrounded ? 12 : 4) * STEP)
        this.velocity.add(this.tempVector)
      } else {
        const friction = Math.exp(-(this.isGrounded ? 12 : 2) * STEP)
        this.velocity.x *= friction
        this.velocity.z *= friction
        if (Math.hypot(this.velocity.x, this.velocity.z) < 0.005) {
          this.velocity.x = this.velocity.z = 0
        }
      }
      this.velocity.y = Math.max(-12, this.velocity.y - 9 * STEP)
      this.position.addScaledVector(this.velocity, STEP)
      this.tempLine.start.copy(this.position)
      this.tempLine.start.y += this.radius
      this.tempLine.end.copy(this.position)
      this.tempLine.end.y += this.height - this.radius
      this.isGrounded = false
      // Repetir tras desplazamientos: el primer contacto puede acercarnos a otra cara.
      for (let pass = 0; pass < 6; pass++) {
        this.corrected = false
        this.updateBounds()
        this.bvh.shapecast(this.callbacks)
        if (!this.corrected) break
      }
      this.position.copy(this.tempLine.start)
      this.position.y -= this.radius
      distance += Math.hypot(
        this.position.x - this.previousPosition.x,
        this.position.z - this.previousPosition.z,
      )
      elapsed += STEP
    }
    if (elapsed > 0) this.speed = distance / elapsed
  }

  stop() {
    this.velocity.x = this.velocity.z = 0
    this.speed = 0
  }

  dispose() {
    if (this.ownsGeometry) this.geometry.dispose()
  }
}
