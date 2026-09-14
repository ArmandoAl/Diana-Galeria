import { copyFileSync, mkdirSync } from 'node:fs'

const destination = new URL('../public/basis/', import.meta.url)
mkdirSync(destination, { recursive: true })
for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  copyFileSync(
    new URL(`../node_modules/three/examples/jsm/libs/basis/${file}`, import.meta.url),
    new URL(file, destination),
  )
}
