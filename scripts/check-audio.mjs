import assert from 'node:assert/strict'
import { AudioContext as ThreeAudioContext, BoxGeometry, Mesh, PerspectiveCamera } from 'three'
import { AudioEngine, DEFAULT_AUDIO_CONFIG } from '../src/audio/AudioEngine.ts'

// Dobles mínimos de Web Audio: comprobamos el grafo y la lógica, no la calidad sonora.
class Param {
  value = 1
  setTargetAtTime(value) { this.value = value }
}
class Node {
  connections = new Set()
  gain = new Param()
  connect(node) { this.connections.add(node); return node }
  disconnect(node) { if (node) this.connections.delete(node); else this.connections.clear() }
}
class Source extends Node {
  playbackRate = new Param()
  detune = new Param()
  stopped = false
  start(time) { this.started = time }
  stop() { this.stopped = true }
}
class Context {
  state = 'suspended'
  currentTime = 0
  destination = new Node()
  sources = []
  nodes = []
  createGain() { const node = new Node(); this.nodes.push(node); return node }
  createConvolver() { return this.createGain() }
  createPanner() { return this.createGain() }
  createBufferSource() { const node = new Source(); this.sources.push(node); return node }
  async resume() { this.state = 'running' }
  async decodeAudioData(bytes) {
    return { duration: 2, numberOfChannels: 2, label: new TextDecoder().decode(bytes) }
  }
}

const originalFetch = globalThis.fetch
const context = new Context()
ThreeAudioContext.setContext(context)
const requests = []
globalThis.fetch = async (url) => {
  requests.push(url)
  return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer }
}
const camera = new PerspectiveCamera()
const artwork = new Mesh(new BoxGeometry(1.8, 1.2, 0.01))
artwork.geometry.translate(3, 1.65, 0) // Origen en cero, vértices desplazados como Ctrl+A.
const engine = new AudioEngine(camera, artwork, '/museum/')
try {
  assert.equal(engine.listener.parent, camera)
  assert.equal(engine.song.parent, artwork)
  assert.deepEqual(engine.song.position.toArray(), [3, 1.649999976158142, 0])
  assert.equal(engine.dry.gain.value, 0.75)
  assert.equal(engine.wet.gain.value, 0.25)
  assert.deepEqual(engine.listener.getInput().connections, new Set([engine.dry, engine.convolver]))
  assert.ok(engine.convolver.connections.has(engine.wet))
  assert.ok(engine.wet.connections.has(engine.master))
  assert.ok(engine.dry.connections.has(engine.master))
  assert.deepEqual(engine.master.connections, new Set([context.destination]))
  assert.equal(engine.song.getDistanceModel(), 'exponential')
  assert.equal(engine.song.getRefDistance(), 1.5)
  assert.equal(engine.song.getMaxDistance(), 8)
  assert.equal(engine.song.getRolloffFactor(), 2)
  assert.throws(() => engine.setConfig({ ...DEFAULT_AUDIO_CONFIG, masterVolume: NaN }))
  const pending = engine.load()
  assert.equal(engine.load(), pending, 'Deduplicar descargas simultáneas.')
  await pending
  assert.equal(requests.length, 4)
  assert.ok(requests.every((url) => url.startsWith('/museum/audio/')))
  assert.ok(engine.convolver.buffer.label.endsWith('room_ir.wav'))
  engine.setActive(true)
  engine.update(2.2, true)
  assert.equal(context.sources.length, 0, 'No reproducir antes del desbloqueo.')
  await engine.unlock()
  camera.position.set(3, 1.65, 1)
  engine.update(0, true)
  assert.equal(context.sources.length, 1, 'Solo canción mientras está parado.')
  assert.equal(engine.song.gain.gain.value, DEFAULT_AUDIO_CONFIG.ambientVolume)
  camera.position.z = 8
  engine.update(0, true)
  assert.equal(engine.song.gain.gain.value, 0, 'Fade adicional a cero desde 8 m.')

  const footsteps = () => context.sources.filter((source) => source.buffer.label.includes('footstep'))
  const walk = (speed, seconds) => {
    for (let frame = 0; frame < seconds * 60; frame++) {
      context.currentTime += 1 / 60
      engine.update(speed, true)
    }
  }
  walk(2.2, 3)
  const walkingCount = footsteps().length
  engine.update(0, true)
  assert.ok(footsteps().every((source) => source.stopped))
  walk(3.4, 3)
  const runningCount = footsteps().length - walkingCount
  assert.ok(runningCount > walkingCount, 'Trote con mayor cadencia que marcha.')
  const clips = footsteps()
  for (let index = 0; index < clips.length; index++) {
    assert.ok(clips[index].buffer.label.endsWith(`footstep_wood_0${index % 2 + 1}.wav`))
    assert.ok(clips[index].playbackRate.value >= 0.95 && clips[index].playbackRate.value <= 1.05)
  }
  const beforeAir = clips.length
  engine.update(3.4, false)
  assert.equal(footsteps().length, beforeAir)
  engine.setConfig({ ...DEFAULT_AUDIO_CONFIG, muted: true })
  walk(2.2, 1)
  assert.equal(footsteps().length, beforeAir)
  assert.equal(engine.master.gain.value, 0)
  engine.setActive(false)
  assert.equal(engine.song.isPlaying, false)
  assert.ok(context.sources.every((source) => source.stopped))
  engine.dispose()
  engine.dispose()
  assert.equal(engine.song.parent, null)
  assert.equal(engine.listener.parent, null)
  assert.ok(context.nodes.every((node) => node.connections.size === 0))
  assert.equal(context.state, 'running', 'No cerrar el contexto global compartido.')

  const retry = new AudioEngine(camera, artwork)
  const ordinary = new AudioEngine(camera)
  const beforeOrdinary = requests.length
  await ordinary.load()
  assert.equal(requests.length - beforeOrdinary, 3, 'Una sala sin dedicatoria no descarga la canción.')
  ordinary.setActive(true)
  await ordinary.unlock()
  ordinary.update(0, true)
  assert.equal(ordinary.song.isPlaying, false)
  ordinary.dispose()
  globalThis.fetch = async () => ({ ok: false, status: 404 })
  await assert.rejects(retry.load(), /HTTP 404/)
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) })
  await retry.load()
  retry.dispose()

  const cancelled = new AudioEngine(camera, artwork)
  globalThis.fetch = async (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
  const loading = cancelled.load()
  const rejection = assert.rejects(loading, /aborted/)
  cancelled.dispose()
  await rejection
  console.log('OK: wet/dry sin duplicación, desbloqueo, anclaje, alcance, alternancia, pitch, cadencia, pausa, mute, reintento y limpieza/abort.')
} finally {
  engine.dispose()
  globalThis.fetch = originalFetch
  artwork.geometry.dispose()
  artwork.material.dispose()
}
