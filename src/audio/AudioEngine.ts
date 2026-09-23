import { AudioListener, PositionalAudio, Vector3 } from 'three'
import type { Camera, Mesh } from 'three'
import type { AudioConfig } from '../types/gallery.ts'

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  muted: false, masterVolume: 0.8, ambientVolume: 0.5, footstepsVolume: 0.4,
}

/** Una instancia por Canvas. Construir y llamar unlock() desde un gesto del usuario. */
export class AudioEngine {
  readonly listener: AudioListener
  readonly context: AudioContext
  readonly song: PositionalAudio
  readonly convolver: ConvolverNode
  readonly dry: GainNode
  readonly wet: GainNode
  readonly master: GainNode
  private readonly footsteps: GainNode
  private readonly footSources = new Set<AudioBufferSourceNode>()
  private readonly listenerPosition = new Vector3()
  private readonly songPosition = new Vector3()
  private readonly baseUrl: string
  private config: AudioConfig = DEFAULT_AUDIO_CONFIG
  private clips: AudioBuffer[] = []
  private loading: Promise<void> | null = null
  private abort: AbortController | null = null
  private ready = false
  private unlocked = false
  private active = false
  private disposed = false
  private lastPlayedIndex = -1
  private readonly hasSong: boolean

  constructor(camera: Camera, specialArtwork?: Mesh, baseUrl = '/') {
    if (specialArtwork && !specialArtwork.geometry.getAttribute('position')) {
      throw new Error('La obra especial necesita una malla con geometría.')
    }
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    this.hasSong = !!specialArtwork
    this.listener = new AudioListener()
    this.context = this.listener.context
    this.master = this.context.createGain()
    this.dry = this.context.createGain()
    this.wet = this.context.createGain()
    this.convolver = this.context.createConvolver()
    this.footsteps = this.context.createGain()
    this.dry.gain.value = 0.75
    this.wet.gain.value = 0.25
    this.master.gain.value = 0
    this.convolver.normalize = true

    // Eliminar la salida directa que Three crea: no duplicar la señal seca.
    const input = this.listener.getInput()
    input.disconnect()
    input.connect(this.dry).connect(this.master)
    input.connect(this.convolver).connect(this.wet).connect(this.master)
    this.master.connect(this.context.destination)
    this.footsteps.connect(input)
    camera.add(this.listener)

    this.song = new PositionalAudio(this.listener)
    this.song.setLoop(true)
    this.song.setDistanceModel('exponential')
    this.song.setRefDistance(1.5)
    this.song.setMaxDistance(8)
    this.song.setRolloffFactor(2)
    this.song.setVolume(0)
    // Ctrl+A en Blender deja orígenes en (0,0,0): anclar al centro local de la placa.
    if (specialArtwork) {
      specialArtwork.geometry.computeBoundingBox()
      specialArtwork.geometry.boundingBox!.getCenter(this.song.position)
      specialArtwork.add(this.song)
    } else camera.add(this.song)
    this.setConfig(DEFAULT_AUDIO_CONFIG)
  }

  setConfig(config: AudioConfig) {
    if (typeof config.muted !== 'boolean'
      || [config.masterVolume, config.ambientVolume, config.footstepsVolume]
        .some((gain) => !Number.isFinite(gain) || gain < 0 || gain > 1)) {
      throw new Error('AudioConfig requiere muted booleano y ganancias entre 0 y 1.')
    }
    if (this.disposed) return
    this.config = { ...config }
    this.footsteps.gain.setTargetAtTime(config.footstepsVolume, this.context.currentTime, 0.02)
    this.master.gain.setTargetAtTime(
      this.active && !config.muted ? config.masterVolume : 0, this.context.currentTime, 0.02,
    )
    if (config.muted) this.stopSteps()
  }

  /** resume se invoca ANTES de cualquier await/fetch para conservar la activación del usuario. */
  async unlock(): Promise<void> {
    if (this.disposed) return
    await this.context.resume()
    if (this.disposed) return
    if (this.context.state !== 'running') throw new Error('El navegador no permitió activar el audio.')
    this.unlocked = true
  }

  load(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('AudioEngine ya fue destruido.'))
    if (this.ready) return Promise.resolve()
    if (this.loading) return this.loading
    const abort = new AbortController()
    this.abort = abort
    this.loading = Promise.all([
      this.loadBuffer('room_ir.wav', abort.signal),
      Promise.all([1, 2, 3, 4].map((number) => this.loadBuffer(`footstep_wood_0${number}.wav`, abort.signal))),
      this.hasSong ? this.loadBuffer('special_song.mp3', abort.signal) : Promise.resolve(null),
    ]).then(([ir, clips, song]) => {
      if (this.disposed) return
      if (![1, 2, 4].includes(ir.numberOfChannels)) {
        throw new Error('room_ir.wav debe tener 1, 2 o 4 canales para ConvolverNode.')
      }
      this.convolver.buffer = ir
      this.clips = clips
      if (song) this.song.setBuffer(song)
      this.ready = true
    }).catch((error: unknown) => {
      abort.abort()
      throw error
    }).finally(() => { this.loading = null })
    return this.loading
  }

  private async loadBuffer(file: string, signal: AbortSignal): Promise<AudioBuffer> {
    const response = await fetch(`${this.baseUrl}audio/${file}`, { signal })
    if (!response.ok) throw new Error(`No se pudo cargar audio/${file} (HTTP ${response.status}).`)
    const bytes = await response.arrayBuffer()
    try {
      const buffer = await this.context.decodeAudioData(bytes)
      if (buffer.duration <= 0) throw new Error('Audio vacío.')
      return buffer
    } catch (cause) {
      throw new Error(`No se pudo decodificar audio/${file}. Comprueba que sea un archivo de audio válido.`, { cause })
    }
  }

  setActive(active: boolean) {
    if (this.disposed || this.active === active) return
    this.active = active
    const now = this.context.currentTime
    this.master.gain.setTargetAtTime(
      active && !this.config.muted ? this.config.masterVolume : 0, now, 0.02,
    )
    if (!active) {
      this.stopSteps()
      if (this.song.isPlaying) {
        this.song.pause()
        this.song.source?.disconnect()
      }
    }
  }

  /** Reproduce una variación evitando repetir la última selección. */
  playRandomFootstep(): void {
    if (this.disposed || !this.active || !this.unlocked || !this.ready
      || this.config.muted || this.context.state !== 'running' || !this.clips.length) return
    let index = Math.floor(Math.random() * this.clips.length)
    if (this.clips.length > 1 && index === this.lastPlayedIndex) {
      index = (index + 1 + Math.floor(Math.random() * (this.clips.length - 1))) % this.clips.length
    }
    this.lastPlayedIndex = index
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    source.buffer = this.clips[index]
    source.playbackRate.value = 0.96 + Math.random() * 0.08
    gain.gain.value = 0.27 + Math.random() * 0.06
    source.connect(gain)
    gain.connect(this.footsteps)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      this.footSources.delete(source)
    }
    this.footSources.add(source)
    source.start()
  }

  /** Actualiza únicamente la capa ambiental; los pasos se disparan por distancia en PlayerRig. */
  update() {
    if (this.disposed) return
    const now = this.context.currentTime
    if (!this.active || !this.unlocked || !this.ready || this.context.state !== 'running') {
      this.stopSteps()
      return
    }

    this.listener.getWorldPosition(this.listenerPosition)
    this.song.getWorldPosition(this.songPosition)
    const distance = this.listenerPosition.distanceTo(this.songPosition)
    // maxDistance no limita el modelo exponencial. Fade adicional 7–8 m, sin salto de volumen.
    const t = Math.max(0, Math.min(1, 8 - distance))
    this.song.setVolume(this.hasSong ? this.config.ambientVolume * t * t * (3 - 2 * t) : 0)
    if (this.hasSong && !this.song.isPlaying) this.song.play()

  }

  private stopSteps() {
    for (const source of this.footSources) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    this.footSources.clear()
  }

  dispose() {
    if (this.disposed) return
    this.setActive(false)
    this.disposed = true
    this.abort?.abort()
    this.stopSteps()
    this.song.source?.disconnect()
    this.song.panner.disconnect()
    this.song.gain.disconnect()
    this.song.removeFromParent()
    this.listener.removeFromParent()
    this.listener.getInput().disconnect()
    this.footsteps.disconnect()
    this.convolver.disconnect()
    this.convolver.buffer = null
    this.dry.disconnect()
    this.wet.disconnect()
    this.master.disconnect()
    this.clips = []
    // Three comparte AudioContext: no cerrar ni suspender el contexto de otros consumidores.
  }
}
