import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Box3, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { prepareGallery } from '../src/controllers/prepareGallery.ts'
import { KinematicPlayer } from '../src/controllers/KinematicPlayer.ts'
import { parseArtworks } from '../src/data/loadArtworks.ts'

const root = new URL('../', import.meta.url)
const report = JSON.parse(await readFile(new URL('assets/munal-daylight-report.json', root), 'utf8'))
const png = await readFile(new URL('public/textures/munal_daylight_lightmap.png', root))
assert.equal(png.readUInt32BE(16), 4096)
assert.equal(png.readUInt32BE(20), 4096)
assert.equal(png[24], 16)
assert.equal(report.samples, 1024)
assert.equal(report.color_pass, false)
assert.deepEqual(report.passes, ['DIRECT', 'INDIRECT'])
assert.equal(report.uv_overlap_loops, 0)
assert.ok(report.png_roundtrip_max_error < 0.001)

const bytes = await readFile(new URL('public/models/munal_gallery_daylight.glb', root))
const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
assert.equal(document.meshes.length, 42)
assert.equal(document.images.length, 10, 'Parquet, jardín y ocho cuadros embebidos.')
assert.ok(document.images.every((image) => Number.isInteger(image.bufferView)))
// Node no decodifica imágenes del navegador. Solo se omite esa etapa para validar
// geometría y materiales reales del GLB; el PNG se verificó también en Blender.
const loader = new GLTFLoader().register(() => ({
  name: 'GeometryValidation', loadTexture: () => Promise.resolve(new Texture()),
}))
const { scene } = await loader.parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
)
const collider = scene.getObjectByName('Collider_Room')
assert.ok(collider?.isMesh)
assert.equal(collider.userData.collider, true)
assert.deepEqual(new Box3().setFromObject(collider).getSize(new Vector3()).toArray(), [8, 5.5, 16])
let lightmapped = 0
scene.traverse((object) => {
  if (!object.isMesh || !object.name.startsWith('Architecture_')) return
  lightmapped++
  assert.ok(object.geometry.attributes.uv)
  const uv = object.geometry.attributes.uv1
  assert.ok(uv)
  assert.ok(uv.array.every((value) => value >= -1e-6 && value <= 1 + 1e-6))
})
assert.equal(lightmapped, 5)
assert.ok(document.materials.some((material) => material.name === 'Mat_Mampara_Tono'))
assert.ok(document.materials.some((material) => material.name === 'Mat_Pilastra_Marfil'))
const glass = document.materials.find((material) => material.name === 'Mat_Cristal_Claro')
assert.equal(glass?.extensions?.KHR_materials_transmission?.transmissionFactor, 1)
assert.ok(!glass.emissiveFactor?.some((value) => value > 0), 'El cristal no emite luz.')
assert.equal(report.modules, 3)
const artworks = parseArtworks(JSON.parse(await readFile(new URL('public/data/artworks.json', root), 'utf8')))
const prepared = prepareGallery(scene, new Texture(), artworks, artworks.map(() => new Texture()))
const player = new KinematicPlayer(prepared.scene, new Vector3(), prepared.collider)
const direction = new Vector3(1, 0, 0)
for (let frame = 0; frame < 600; frame++) player.update(1 / 60, direction, true)
assert.ok(Math.abs(player.position.x - 3.65) < 0.001)
assert.ok(Math.abs(player.position.y) < 0.001)
assert.ok(player.isGrounded)
player.dispose()
// glTF convierte (x,y,z) de Blender a (x,z,-y): ambos pasos deben ser transitables.
for (const fps of [30, 60, 144]) {
  for (const [wallX, passageX, wallZ] of [[-1.6, 2.3, 3.4], [1.6, -2.3, -3.4]]) {
    for (const side of [-1, 1]) {
      const direction = new Vector3(0, 0, -side)
      const blocked = new KinematicPlayer(prepared.scene, new Vector3(wallX, 0, wallZ + side * 1.5), prepared.collider)
      const passage = new KinematicPlayer(prepared.scene, new Vector3(passageX, 0, wallZ + side * 1.5), prepared.collider)
      for (let frame = 0; frame < fps * 1.5; frame++) {
        blocked.update(1 / fps, direction, true)
        passage.update(1 / fps, direction, false)
      }
      assert.ok(Math.abs(blocked.position.z - (wallZ + side * .5)) < .001, 'La mampara detiene al jugador.')
      assert.ok((passage.position.z - wallZ) * side < -.7, 'El paso conecta las salas.')
      assert.ok(blocked.isGrounded && passage.isGrounded)
      blocked.dispose()
      passage.dispose()
    }
  }
}
prepared.dispose()
console.log('OK: sala diurna, ventanas transparentes, jardín, puertas, PNG 4096²/16 bits y pasos en ambos sentidos a 30/60/144 FPS.')
