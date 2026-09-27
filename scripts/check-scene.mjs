import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { LinearSRGBColorSpace, Mesh, MeshStandardMaterial, SRGBColorSpace, Texture, Vector3 } from 'three'
import { prepareGallery } from '../src/controllers/prepareGallery.ts'
import { KinematicPlayer } from '../src/controllers/KinematicPlayer.ts'
import { parseArtworks } from '../src/data/loadArtworks.ts'

const bytes = await readFile(new URL('../public/models/exhibition-room.glb', import.meta.url))
const { scene: source } = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
)
const data = parseArtworks(JSON.parse(await readFile(new URL('../public/data/artworks.json', import.meta.url), 'utf8'))).slice(0, 8)
const lightmap = new Texture()
const mounts = data.map((artwork) => ({ type: 'artwork', data: artwork, slotIndex: artwork.slotIndex, texture: new Texture() }))
assert.throws(() => prepareGallery(source, lightmap, mounts), /TEXCOORD_1/)
// Fixture SOLO en memoria para probar asignaciones: no es un atlas válido ni un bake definitivo.
source.traverse((object) => {
  if (object instanceof Mesh && object.name.startsWith('Architecture_')) {
    object.geometry = object.geometry.clone()
    object.geometry.setAttribute('uv1', object.geometry.getAttribute('uv').clone())
  }
})
const prepared = prepareGallery(source, lightmap, mounts)
assert.notEqual(prepared.scene, source)
assert.equal(prepared.collider.visible, false)
assert.ok(prepared.collider.geometry.boundsTree)
assert.notEqual(prepared.collider.geometry, source.getObjectByName('Collider_Room').geometry)
const player = new KinematicPlayer(prepared.scene, new Vector3(), prepared.collider)
assert.equal(player.bvh, prepared.collider.geometry.boundsTree, 'Reutilizar la BVH sin construir otra.')
for (let frame = 0; frame < 600; frame++) player.update(1 / 60, new Vector3(1, 0, 0), true)
assert.ok(Math.abs(player.position.x - 3.65) < 1e-3)
assert.ok(player.isGrounded)
let architecture = 0
let floor = 0
let frameCount = 0
prepared.scene.traverse((object) => {
  if (!(object instanceof Mesh) || object === prepared.collider) return
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  if (object.name.startsWith('Frame_')) {
    frameCount++
    assert.equal(materials[0].color.getHexString(), 'b99a61')
    assert.equal(materials[0].metalness, 0.55)
    assert.equal(materials[0].roughness, 0.38)
  } else if (object.name.startsWith('Architecture_')) {
    for (const material of materials) {
      assert.ok(material instanceof MeshStandardMaterial)
      assert.equal(material.lightMap.channel, 1)
      assert.equal(material.lightMap.flipY, false)
      assert.equal(material.lightMap.colorSpace, LinearSRGBColorSpace)
      assert.equal(material.lightMapIntensity, Math.PI)
      assert.notEqual(material.lightMap, lightmap)
      architecture++
      if (/Parquet/.test(material.name)) {
        floor++
        assert.equal(material.roughness, 0.25)
        assert.equal(material.metalness, 0.05)
      }
    }
  }
})
assert.equal(architecture, 2)
assert.equal(floor, 1)
assert.equal(frameCount, 8)
for (const artwork of data) {
  const name = 'Artwork_' + String(artwork.slotIndex + 1).padStart(2, '0')
  const material = prepared.scene.getObjectByName(name).material
  assert.ok(material.map)
  assert.equal(material.map.colorSpace, SRGBColorSpace)
  assert.equal(material.map.flipY, false)
  assert.notEqual(material, source.getObjectByName(name).material)
}
assert.equal(lightmap.channel, 0, 'No mutar la caché del loader.')
assert.equal(lightmap.flipY, true)
player.dispose()
assert.ok(prepared.collider.geometry.boundsTree, 'El jugador no es dueño de la geometría prestada.')
prepared.dispose()
assert.equal(prepared.collider.geometry.boundsTree, null)
console.log('OK: rechazo sin UV1, materiales/lightmap, 8 imágenes/marcos, BVH compartida, física y limpieza sin mutar cachés.')
