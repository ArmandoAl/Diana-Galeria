import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Mesh } from 'three'
import type { Object3D } from 'three'
import { AudioEngine, DEFAULT_AUDIO_CONFIG } from '../../audio/AudioEngine.ts'
import { useGalleryStore } from '../../stores/useGalleryStore.ts'
import type { ArtworkData, AudioConfig } from '../../types/gallery.ts'

export type AudioEngineRef = { current: AudioEngine | null }

export interface AudioManagerProps {
  scene: Object3D
  artworks: readonly ArtworkData[]
  lockSelector?: string
  config?: AudioConfig
  onError?: (error: Error) => void
  engineRef?: AudioEngineRef
}

const reportError = (error: Error) => console.error('[MUNAL Audio]', error)

/** Montar una vez dentro del Canvas, junto a PlayerRig. No renderiza elementos visuales. */
export function AudioManager({
  scene, artworks, lockSelector = '#enter-gallery', config = DEFAULT_AUDIO_CONFIG,
  onError = reportError, engineRef,
}: AudioManagerProps) {
  const camera = useThree((state) => state.camera)
  const canvas = useThree((state) => state.gl.domElement)
  const engine = useRef<AudioEngine | null>(null)
  const latest = useRef({ config, onError })

  useEffect(() => {
    latest.current = { config, onError }
    try { engine.current?.setConfig(config) }
    catch (error) { onError(error instanceof Error ? error : new Error(String(error))) }
  }, [config, onError])

  useEffect(() => {
    let disposed = false
    let entered = false
    const report = (error: unknown) => {
      if (!disposed) latest.current.onError(error instanceof Error ? error : new Error(String(error)))
    }
    const syncActive = () => {
      if (document.pointerLockElement === canvas) entered = true
      const state = useGalleryStore.getState()
      engine.current?.setActive(!document.hidden && document.hasFocus() && !state.isTransitioning && (
        state.isExploring
        || document.pointerLockElement === canvas
        || (entered && state.isInspecting)
      ))
    }
    const start = () => {
      try {
        if (!engine.current) {
          const special = artworks.filter((artwork) => artwork.isSpecial)
          const slot = special[0]?.slotIndex
          const name = slot === undefined ? '' : `Artwork_${String(slot + 1).padStart(2, '0')}`
          let anchor: Mesh | undefined
          scene.traverse((object) => {
            if (slot !== undefined && object instanceof Mesh && (object.userData.slotIndex === slot || object.name === name)) anchor = object
          })
          if (special.length && !anchor) throw new Error(`No se encontró la placa ${name} para anclar la canción.`)
          engine.current = new AudioEngine(camera, anchor, import.meta.env.BASE_URL)
          if (engineRef) engineRef.current = engine.current
          engine.current.setConfig(latest.current.config)
        }
        // Captura del mismo clic que recibe PointerLockControls; resume antes de las descargas.
        void engine.current.unlock().catch(report)
        void engine.current.load().catch(report)
        syncActive()
      } catch (error) { report(error) }
    }
    const click = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(lockSelector)) start()
    }
    const unsubscribe = useGalleryStore.subscribe((state) => state.isInspecting, syncActive)
    const unsubscribeExploring = useGalleryStore.subscribe((state) => state.isExploring, syncActive)
    const unsubscribeTransition = useGalleryStore.subscribe((state) => state.isTransitioning, syncActive)
    if (document.pointerLockElement === canvas) start()
    document.addEventListener('click', click, true)
    document.addEventListener('pointerlockchange', syncActive)
    document.addEventListener('visibilitychange', syncActive)
    window.addEventListener('blur', syncActive)
    window.addEventListener('focus', syncActive)
    return () => {
      disposed = true
      unsubscribe()
      unsubscribeExploring()
      unsubscribeTransition()
      document.removeEventListener('click', click, true)
      document.removeEventListener('pointerlockchange', syncActive)
      document.removeEventListener('visibilitychange', syncActive)
      window.removeEventListener('blur', syncActive)
      window.removeEventListener('focus', syncActive)
      engine.current?.dispose()
      engine.current = null
      if (engineRef) engineRef.current = null
    }
  }, [camera, canvas, scene, artworks, lockSelector, engineRef])

  useFrame(() => {
    engine.current?.update()
  })

  return null
}
