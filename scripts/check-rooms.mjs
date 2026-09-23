import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Box3, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createGalleryRooms, ROOM_CAPACITY } from '../src/data/galleryRooms.ts'
import { parseArtworks } from '../src/data/loadArtworks.ts'
import { prepareGallery } from '../src/controllers/prepareGallery.ts'
import { ArtworkFocus } from '../src/controllers/ArtworkFocus.ts'
import { KinematicPlayer } from '../src/controllers/KinematicPlayer.ts'
import { useGalleryStore as store } from '../src/stores/useGalleryStore.ts'

const raw = JSON.parse(await readFile(new URL('../public/data/artworks.json', import.meta.url)))
const catalog = parseArtworks(Array.from({ length: 40 }, (_, i) => ({
  ...raw[i % raw.length], id: `test-${i}`, slotIndex: i, isSpecial: i === 30,
})))
for (const count of [1, 6, 8, 12, 13, 20, 40]) {
  const rooms = createGalleryRooms(catalog.slice(0, count))
  assert.equal(rooms.length, Math.ceil(count / ROOM_CAPACITY))
  assert.equal(rooms.at(-1).next, 0)
  assert.equal(rooms[0].previous, rooms.length - 1)
  assert.equal(new Set(rooms.flatMap((room) => room.artworks.map((artwork) => artwork.id))).size, count)
  for (const room of rooms) {
    assert.equal(rooms[room.next].previous, room.index)
    assert.deepEqual(room.artworks.map((artwork) => artwork.slotIndex), Array.from({ length: room.artworks.length }, (_, i) => i))
  }
}
const rooms = createGalleryRooms(catalog)
assert.equal(rooms[0].artworks.length, ROOM_CAPACITY)
assert.equal(rooms[Math.floor(30 / ROOM_CAPACITY)].artworks[30 % ROOM_CAPACITY].isSpecial, true, 'La dedicatoria sigue al id, no al montaje.')
const bytes = await readFile(new URL('../public/models/munal_gallery_daylight.glb', import.meta.url))
const loader = new GLTFLoader().register(() => ({ name: 'GeometryOnly', loadTexture: () => Promise.resolve(new Texture()) }))
const { scene: source } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
const original = source.getObjectByName('Artwork_01').geometry.attributes.position.array.slice()
const image = new Texture({ width: 800, height: 1200 })
for (const room of [rooms[0], rooms[1], rooms[2], rooms[0]]) {
  const gallery = prepareGallery(source, new Texture(), room.artworks, room.artworks.map(() => image), room.palette)
  let visible = 0
  gallery.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (/^Artwork_\d+$/.test(object.name) && object.visible) {
      visible++
      const box = new Box3().setFromObject(object), size = box.getSize(new Vector3())
      assert.ok(Math.abs(Math.max(size.x, size.z) / size.y - 2 / 3) < 1e-5, 'No estirar imágenes verticales.')
      assert.ok(Math.abs(box.getCenter(new Vector3()).y - 1.65) < 1e-5, 'Centro a altura de los ojos.')
    }
    if (object.material?.name === 'Mat_Pared_VerdeMUNAL') {
      assert.equal(object.material.color.getHexString(), room.palette.wall.slice(1))
      assert.ok(object.material.lightMapIntensity > Math.PI)
    }
    if (/^Window_Glass/.test(object.name)) assert.ok(object.material.transparent && object.material.opacity < .3)
  })
  assert.equal(visible, room.artworks.length)
  assert.equal(gallery.scene.getObjectByName('Frame_14').visible, room.artworks.length === 14)
  const focus = new ArtworkFocus(gallery.scene, room.artworks)
  assert.equal(focus.findDoor(new Vector3(0, 1.65, -6.4), new Vector3(0, 0, -1)), 1)
  assert.equal(focus.findDoor(new Vector3(0, 1.65, 6.4), new Vector3(0, 0, 1)), -1)
  assert.equal(focus.findDoor(new Vector3(0, 1.65, 0), new Vector3(0, 0, -1)), null)
  assert.equal(focus.findDoor(new Vector3(0, 1.65, -6.4), new Vector3(0, 0, 1)), null)
  // Recorrer ambos pasos desde la entrada hasta la siguiente puerta, sin teletransportes.
  const player = new KinematicPlayer(gallery.scene, new Vector3(0, 0, 6.2), gallery.collider)
  for (const target of [[2.3,6.2],[2.3,0],[-2.3,0],[-2.3,-6.3],[0,-6.3]]) {
    const delta = new Vector3()
    for (let frame = 0; frame < 1000; frame++) {
      delta.set(target[0]-player.position.x, 0, target[1]-player.position.z)
      if (delta.length() < .07) { player.stop(); break }
      player.update(1/60,delta.normalize())
    }
    assert.ok(Math.hypot(player.position.x-target[0],player.position.z-target[1]) < .08)
    assert.ok(player.isGrounded)
  }
  assert.equal(focus.findDoor(player.position.clone().add(new Vector3(0,1.65,0)),new Vector3(0,0,-1)),1)
  player.dispose()
  gallery.dispose()
}
assert.deepEqual(source.getObjectByName('Artwork_01').geometry.attributes.position.array, original, 'La sala fuente no se muta entre visitas.')
store.getState().setNearDoor(1)
store.getState().setNearArtwork(catalog[0])
store.getState().setTransitioning(true)
assert.equal(store.getState().nearbyDoor, null)
assert.equal(store.getState().nearbyArtwork, null)
store.getState().setTransitioning(false)
console.log('OK: 1–40 obras, anillo 14/14/12, vuelta al inicio, tres paletas, proporciones/centros, puertas y recorrido físico completo.')
