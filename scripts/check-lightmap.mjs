import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const report = JSON.parse(readFileSync(new URL('../assets/lightmap-report.json', import.meta.url)))
const png = readFileSync(new URL('../public/textures/munal_lightmap.png', import.meta.url))
assert.equal(png.readUInt32BE(16), 4096)
assert.equal(png.readUInt32BE(20), 4096)
assert.equal(png[24], 16)
assert.equal(report.color_pass, false)
assert.deepEqual(report.passes, ['DIRECT', 'INDIRECT'])
assert.ok(report.lightmap_gain >= 1)
assert.ok(report.png_roundtrip_max_error < 0.001)
const b = readFileSync(new URL('../public/models/hall-baked.glb', import.meta.url))
const { scene } = await new GLTFLoader().parseAsync(
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '',
)
let modules = 0
scene.traverse((object) => {
  if (!object.isMesh || object.userData.collider) return
  modules++
  assert.ok(object.geometry.attributes.uv, object.name)
  const uv1 = object.geometry.attributes.uv1
  assert.ok(uv1, object.name)
  assert.equal(object.userData.lightmap_channel, 1)
  assert.equal(object.userData.lightmap_gain, report.lightmap_gain)
  for (const value of uv1.array) assert.ok(value >= -1e-6 && value <= 1 + 1e-6)
})
assert.equal(modules, 133)
assert.equal(scene.getObjectByName('Collider_Hall').userData.collider, true)
console.log('LIGHTMAP OK: PNG lineal 4096²/16 bits, 133 mallas con uv + uv1 y collider separado.')
