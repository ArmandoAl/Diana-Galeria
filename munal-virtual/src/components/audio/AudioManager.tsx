import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Mesh } from 'three'
import type { Object3D } from 'three'
import { AudioEngine, DEFAULT_AUDIO_CONFIG } from '../../audio/AudioEngine.ts'
import { useGalleryStore } from '../../stores/useGalleryStore.ts'
import type { ArtworkData, AudioConfig } from '../../types/gallery.ts'

export interface AudioManagerProps {
  scene: Object3D
  artworks: readonly ArtworkData[]
  lockSelector?: string
  config?: AudioConfig
  onError?: (error: Error) => void
}

const reportError = (error: Error) => console.error('[MUNAL Audio]', error)

/** Montar una vez dentro del Canvas, junto a PlayerRig. No renderiza elementos visuales. */
export function AudioManager({
  scene, artworks, lockSelector = '#enter-gallery', config = DEFAULT_AUDIO_CONFIG,
  onError = reportError,
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
      engine.current?.setActive(!document.hidden && document.hasFocus() && (
        document.pointerLockElement === canvas
        || (entered && useGalleryStore.getState().isInspecting)
      ))
    }
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(lockSelector)) return
      try {
        if (!engine.current) {
          const special = artworks.filter((artwork) => artwork.isSpecial)
          if (special.length !== 1) throw new Error('El catálogo necesita exactamente una obra especial.')
          const slot = special[0].slotIndex
          const name = `Artwork_${String(slot + 1).padStart(2, '0')}`
          let anchor: Mesh | undefined
          scene.traverse((object) => {
            if (object instanceof Mesh && (object.userData.slotIndex === slot || object.name === name)) anchor = object
          })
          if (!anchor) throw new Error(`No se encontró la placa ${name} para anclar la canción.`)
          engine.current = new AudioEngine(camera, anchor, import.meta.env.BASE_URL)
          engine.current.setConfig(latest.current.config)
        }
        // Captura del mismo clic que recibe PointerLockControls; resume antes de las descargas.
        void engine.current.unlock().catch(report)
        void engine.current.load().catch(report)
        syncActive()
      } catch (error) { report(error) }
    }
    const unsubscribe = useGalleryStore.subscribe((state) => state.isInspecting, syncActive)
    document.addEventListener('click', click, true)
    document.addEventListener('pointerlockchange', syncActive)
    document.addEventListener('visibilitychange', syncActive)
    window.addEventListener('blur', syncActive)
    window.addEventListener('focus', syncActive)
    return () => {
      disposed = true
      unsubscribe()
      document.removeEventListener('click', click, true)
      document.removeEventListener('pointerlockchange', syncActive)
      document.removeEventListener('visibilitychange', syncActive)
      window.removeEventListener('blur', syncActive)
      window.removeEventListener('focus', syncActive)
      engine.current?.dispose()
      engine.current = null
    }
  }, [camera, canvas, scene, artworks, lockSelector])

  useFrame(() => {
    const state = useGalleryStore.getState()
    engine.current?.update(state.isInspecting ? 0 : state.rawSpeed, state.isGrounded)
  })

  return null
}
