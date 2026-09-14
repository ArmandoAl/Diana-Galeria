import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { Vector3 } from 'three'
import { parseArtworks } from '../src/data/loadArtworks.ts'
import { useGalleryStore as store } from '../src/stores/useGalleryStore.ts'

const publicRoot = new URL('../public/', import.meta.url)
const raw = JSON.parse(await readFile(new URL('data/artworks.json', publicRoot), 'utf8'))
const artworks = parseArtworks(raw)
for (const artwork of artworks) {
  await access(new URL(artwork.imagePath.slice(1), publicRoot))
}
for (const invalid of [null, [], raw.slice(1), raw.map(() => raw[0]),
  raw.map((a) => ({ ...a, isSpecial: false })),
  raw.map((a) => ({ ...a, title: '' })),
  raw.map((a) => ({ ...a, imagePath: '/artworks/../secret.png' })),
]) assert.throws(() => parseArtworks(invalid))

let notifications = 0
let inspectionChanges = 0
const unsubscribe = store.subscribe(() => { notifications++ })
const unsubscribeInspection = store.subscribe(
  (state) => state.isInspecting,
  () => { inspectionChanges++ },
)
const positionReference = store.getState().rawPosition
const velocityReference = store.getState().rawVelocity
const position = new Vector3(1, 1.65, 2)
const velocity = new Vector3(0, 0, 1)
for (let frame = 0; frame < 60; frame++) {
  store.getState().updatePlayerTransform(position, velocity, true)
}
assert.equal(notifications, 0, 'La física no debe notificar a los suscriptores.')
assert.equal(store.getState().rawPosition, positionReference)
assert.equal(store.getState().rawVelocity, velocityReference)
assert.ok(positionReference.equals(position))
assert.ok(velocityReference.equals(velocity))
assert.equal(store.getState().isGrounded, true)
assert.equal(store.getState().rawSpeed, 1)
store.getState().updatePlayerTransform(position, velocity, true, 0)
assert.equal(store.getState().rawSpeed, 0, 'La rapidez resuelta puede diferir de la velocidad solicitada.')
assert.equal(notifications, 0)
position.set(99, 99, 99)
assert.equal(positionReference.x, 1, 'Copiar vectores, no conservar referencias externas.')

store.getState().setNearArtwork(artworks[0])
assert.equal(store.getState().isNearArtwork, true)
const beforeRepeatedProximity = notifications
store.getState().setNearArtwork(artworks[0])
assert.equal(notifications, beforeRepeatedProximity)
store.getState().openArtworkModal(artworks[0])
store.getState().setNearArtwork(artworks[1])
assert.equal(store.getState().activeArtwork, artworks[0])
assert.equal(store.getState().nearbyArtwork, artworks[1])
store.getState().setNearArtwork(null)
assert.equal(store.getState().isNearArtwork, false)
assert.equal(store.getState().activeArtwork, artworks[0])
store.getState().setNearArtwork(artworks[1])
store.getState().closeArtworkModal()
assert.equal(store.getState().activeArtwork, null)
assert.equal(store.getState().isInspecting, false)
assert.equal(store.getState().nearbyArtwork, artworks[1])
assert.equal(store.getState().isNearArtwork, true)
assert.equal(inspectionChanges, 2)
const beforeRepeatedClose = notifications
store.getState().closeArtworkModal()
assert.equal(notifications, beforeRepeatedClose)
assert.equal(store.getState().isGrounded, true)
unsubscribe()
unsubscribeInspection()
console.log('OK: 8 obras e imágenes, validación, inspección, proximidad y física sin notificaciones.')
