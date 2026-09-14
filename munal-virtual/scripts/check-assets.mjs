import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  assert.deepEqual(readFileSync(new URL(`../public/basis/${file}`, import.meta.url)),
    readFileSync(new URL(`../node_modules/three/examples/jsm/libs/basis/${file}`, import.meta.url)))
}
const bytes = readFileSync(new URL('../public/models/hall.glb', import.meta.url))
const { scene } = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
)
let meshes = 0
scene.traverse((object) => { if (object.isMesh) meshes++ })
assert.equal(meshes, 134)
assert.equal(scene.getObjectByName('Collider_Hall').userData.collider, true)
assert.equal(scene.getObjectByName('Cube'), undefined)
assert.ok(scene.getObjectByName('Floor_MarbleGrid').geometry.attributes.uv)
console.log('OK: Basis coincide con Three.js; GLB contiene 134 mallas, UV y collider etiquetado.')
