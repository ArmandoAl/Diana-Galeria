import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { KinematicPlayer } from '../src/controllers/KinematicPlayer.ts'
import { ArtworkFocus } from '../src/controllers/ArtworkFocus.ts'
import { parseArtworks } from '../src/data/loadArtworks.ts'

const model = process.argv[2] ?? 'munal_gallery.glb'
const bytes = await readFile(new URL(`../public/models/${model}`, import.meta.url))
// Node valida geometría/física del asset final sin decodificar imágenes del navegador.
const loader = new GLTFLoader().register(() => ({
  name: 'GeometryValidation', loadTexture: () => Promise.resolve(new Texture()),
}))
const { scene } = await loader.parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
)
scene.updateMatrixWorld(true)
const source = scene.getObjectByName('Collider_Room')
assert.ok(source?.isMesh)
const originalVertices = source.geometry.attributes.position.array.slice()
const idle = new Vector3()
const forward = new Vector3(0, 0, -1)
const advance = (player, seconds, direction = idle, running = false, fps = 60) => {
  for (let i = 0; i < seconds * fps; i++) player.update(1 / fps, direction, running)
}

for (const fps of [30, 60, 144]) {
  const player = new KinematicPlayer(scene, new Vector3(0, 2, 0))
  const scratch = [player.tempVector, player.tempLine, player.tempBox]
  advance(player, 3, idle, false, fps)
  assert.ok(Math.abs(player.position.y) < 1e-4, `Suelo a ${fps} FPS: ${player.position.y}`)
  assert.equal(player.isGrounded, true)
  assert.ok(Math.abs(player.position.y + player.eyeHeight - 1.65) < 1e-4)
  advance(player, 10, forward, true, fps)
  assert.ok(Math.abs(player.position.z + 7.65) < 1e-3, 'No atravesar muro/puerta cerrada.')
  assert.ok(player.speed < 0.001, 'No generar pasos al empujar una pared.')
  advance(player, 10, new Vector3(1, 0, -1), true, fps)
  assert.ok(Math.abs(player.position.x - 3.65) < 1e-3)
  assert.ok(Math.abs(player.position.z + 7.65) < 1e-3)
  assert.ok(player.isGrounded)
  advance(player, 10, new Vector3(-1, 0, 1), true, fps)
  advance(player, 10, new Vector3(-1, 0, 1), true, fps)
  assert.ok(Math.abs(player.position.x + 3.65) < 1e-3)
  assert.ok(Math.abs(player.position.z - 7.65) < 1e-3)
  assert.equal(scratch[0], player.tempVector)
  assert.equal(scratch[1], player.tempLine)
  assert.equal(scratch[2], player.tempBox)
  player.dispose()
}

const walking = new KinematicPlayer(scene)
const diagonal = new KinematicPlayer(scene)
advance(walking, 1, forward)
advance(diagonal, 1, new Vector3(1, 0, -1))
assert.ok(Math.abs(Math.hypot(walking.position.x, walking.position.z)
  - Math.hypot(diagonal.position.x, diagonal.position.z)) < 1e-6, 'Diagonal normalizada.')
assert.ok(walking.speed > 2 && walking.speed <= 2.201)
advance(walking, 1)
assert.ok(walking.speed < 0.01, 'Fricción debe frenar sin teclas.')
walking.velocity.y = 12
advance(walking, 2)
assert.ok(walking.position.y >= -1e-4 && walking.position.y <= 3.751)
walking.update(100, forward, true)
assert.ok(walking.position.z >= -7.651, 'Pausa larga no causa tunneling.')
assert.throws(() => new KinematicPlayer(scene, new Vector3(100, 0, 0)))
assert.throws(() => new KinematicPlayer(new Group()))
walking.dispose()
diagonal.dispose()
assert.deepEqual(source.geometry.attributes.position.array, originalVertices)

const data = parseArtworks(JSON.parse(await readFile(
  new URL('../public/data/artworks.json', import.meta.url), 'utf8',
))).slice(0, 8)
const focus = new ArtworkFocus(scene, data)
const origin = new Vector3()
const direction = new Vector3()
const center = new Vector3()
const eye = new Vector3(0, 1.65, 0)
for (const artwork of data) {
  const mesh = scene.getObjectByName(`Artwork_${String(artwork.slotIndex + 1).padStart(2, '0')}`)
  new Box3().setFromObject(mesh).getCenter(center)
  direction.subVectors(center, eye).normalize()
  origin.copy(center).addScaledVector(direction, -1.5)
  assert.equal(focus.find(origin, direction)?.id, artwork.id, 'Cuadro visible a 1.5 m.')
  origin.copy(center).addScaledVector(direction, -2.1)
  assert.equal(focus.find(origin, direction), null, 'No interactuar fuera de alcance.')
  origin.copy(center).addScaledVector(direction, -1.5)
  direction.negate()
  assert.equal(focus.find(origin, direction), null, 'Debe mirar hacia el cuadro.')
}
const obstruction = new Mesh(new BoxGeometry(0.5, 2, 2), new MeshBasicMaterial())
obstruction.position.set(-3, 1.65, 0)
scene.add(obstruction)
scene.updateMatrixWorld(true)
const occluded = new ArtworkFocus(scene, data)
assert.equal(occluded.find(new Vector3(-2.5, 1.65, 0), new Vector3(-1, 0, 0)), null)
scene.remove(obstruction)
obstruction.geometry.dispose()
obstruction.material.dispose()

// Transformaciones de padres: la BVH debe permanecer en unidades mundiales.
scene.scale.set(1.5, 1, 0.75)
scene.rotation.y = Math.PI / 2
scene.position.set(10, 0, 4)
scene.updateMatrixWorld(true)
const transformed = new KinematicPlayer(scene, new Vector3(10, 0, 4))
advance(transformed, 10, new Vector3(1, 0, 0), true)
assert.ok(Math.abs(transformed.position.x - 15.65) < 1e-3)
assert.ok(Math.abs(transformed.position.y) < 1e-4)
transformed.dispose()
console.log(`OK (${model}): suelo, cuatro muros, esquinas, fricción, diagonal, pausas, 30/60/144 FPS, transformaciones y foco/oclusión de 8 obras.`)
