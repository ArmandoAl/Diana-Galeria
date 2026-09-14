import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import type { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib'
import { Vector3 } from 'three'
import type { Mesh, Object3D } from 'three'
import { KinematicPlayer } from '../../controllers/KinematicPlayer.ts'
import { ArtworkFocus } from '../../controllers/ArtworkFocus.ts'
import { useGalleryStore } from '../../stores/useGalleryStore.ts'
import type { ArtworkData } from '../../types/gallery.ts'

export interface PlayerRigProps {
  /** Escena GLB ya montada, con transformaciones definitivas. */
  scene: Object3D
  collider?: Mesh
  artworks: readonly ArtworkData[]
  spawn?: readonly [number, number, number]
  /** Selector de un botón HTML explícito para entrar/reanudar el recorrido. */
  lockSelector?: string
  /** Señal síncrona para audio: rapidez horizontal real (m/s), contacto con suelo. */
  onMotion?: (speed: number, grounded: boolean) => void
  onLockChange?: (locked: boolean) => void
}

const DEFAULT_SPAWN = [0, 0, 0] as const

export function PlayerRig({
  scene, collider, artworks, spawn = DEFAULT_SPAWN, lockSelector = '#enter-gallery',
  onMotion, onLockChange,
}: PlayerRigProps) {
  const camera = useThree((state) => state.camera)
  const canvas = useThree((state) => state.gl.domElement)
  const controls = useRef<PointerLockControlsImpl>(null)
  const player = useRef<KinematicPlayer | null>(null)
  const focus = useRef<ArtworkFocus | null>(null)
  const keys = useRef(new Set<string>())
  const vectors = useRef({ forward: new Vector3(), right: new Vector3(), wish: new Vector3() })
  const focusElapsed = useRef(0)
  const [spawnX, spawnY, spawnZ] = spawn

  useEffect(() => {
    const controller = new KinematicPlayer(scene, new Vector3(spawnX, spawnY, spawnZ), collider)
    let artworkFocus: ArtworkFocus
    try { artworkFocus = new ArtworkFocus(scene, artworks) }
    catch (error) { controller.dispose(); throw error }
    const wasVisible = controller.collider.visible
    controller.collider.visible = false
    player.current = controller
    focus.current = artworkFocus
    camera.position.set(controller.position.x, controller.position.y + controller.eyeHeight, controller.position.z)
    const store = useGalleryStore.getState()
    store.updatePlayerTransform(controller.position, controller.velocity, false)
    return () => {
      controller.stop()
      useGalleryStore.getState().updatePlayerTransform(
        controller.position, controller.velocity, controller.isGrounded, 0,
      )
      player.current = null
      focus.current = null
      controller.collider.visible = wasVisible
      controller.dispose()
      useGalleryStore.getState().setNearArtwork(null)
    }
  }, [scene, collider, artworks, camera, spawnX, spawnY, spawnZ])

  useEffect(() => {
    const input = keys.current
    const stop = () => {
      input.clear()
      player.current?.stop()
      if (player.current) {
        const current = player.current
        useGalleryStore.getState().updatePlayerTransform(
          current.position, current.velocity, current.isGrounded, 0,
        )
      }
      onMotion?.(0, useGalleryStore.getState().isGrounded)
      useGalleryStore.getState().setNearArtwork(null)
    }
    const release = () => { stop(); controls.current?.unlock() }
    const contemplate = () => {
      const state = useGalleryStore.getState()
      if (!controls.current?.isLocked || state.isInspecting) return
      // E y clic comparten la misma comprobación actual de distancia, orientación y oclusión.
      camera.updateMatrixWorld()
      camera.getWorldDirection(vectors.current.forward)
      const artwork = focus.current?.find(camera.position, vectors.current.forward)
      if (artwork) state.openArtworkModal(artwork)
    }
    const click = (event: MouseEvent) => { if (event.button === 0) contemplate() }
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement
        && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return
      const state = useGalleryStore.getState()
      if (!controls.current?.isLocked || state.isInspecting) return
      if (/^(Key[WASD]|ShiftLeft|ShiftRight|KeyE)$/.test(event.code)) event.preventDefault()
      if (event.code === 'KeyE' && !event.repeat) {
        contemplate()
      } else input.add(event.code)
    }
    const keyup = (event: KeyboardEvent) => { input.delete(event.code) }
    const visibility = () => { if (document.hidden) release() }
    const lockChanged = () => {
      if (!controls.current?.isLocked) stop()
      onLockChange?.(controls.current?.isLocked ?? false)
    }
    const unsubscribe = useGalleryStore.subscribe(
      (state) => state.isInspecting,
      (inspecting) => { if (inspecting) release() },
      { fireImmediately: true },
    )
    window.addEventListener('keydown', keydown)
    canvas.addEventListener('click', click)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('pointerlockchange', lockChanged)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', keydown)
      canvas.removeEventListener('click', click)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('pointerlockchange', lockChanged)
      release()
    }
  }, [camera, canvas, onMotion, onLockChange])

  useFrame((_, delta) => {
    const current = player.current
    if (!current) return
    const state = useGalleryStore.getState()
    const enabled = !!controls.current?.isLocked && !state.isInspecting && !document.hidden
    const { forward, right, wish } = vectors.current
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    right.set(-forward.z, 0, forward.x)
    wish.set(0, 0, 0)
    const input = keys.current
    if (enabled) {
      wish.addScaledVector(forward, Number(input.has('KeyW')) - Number(input.has('KeyS')))
      wish.addScaledVector(right, Number(input.has('KeyD')) - Number(input.has('KeyA')))
    } else current.stop()
    current.update(delta, wish, enabled && (input.has('ShiftLeft') || input.has('ShiftRight')))
    camera.position.set(current.position.x, current.position.y + current.eyeHeight, current.position.z)
    camera.updateMatrixWorld()
    state.updatePlayerTransform(current.position, current.velocity, current.isGrounded, enabled ? current.speed : 0)
    onMotion?.(enabled ? current.speed : 0, current.isGrounded)
    focusElapsed.current += delta
    // El Raycaster de Three crea resultados internamente: limitarlo a 10 Hz.
    // E siempre hace una comprobación nueva, independientemente de este intervalo.
    if (!enabled || focusElapsed.current >= 0.1) {
      focusElapsed.current = 0
      camera.getWorldDirection(forward)
      state.setNearArtwork(enabled ? focus.current?.find(camera.position, forward) ?? null : null)
    }
  }, -1) // Resolver física antes de AudioManager (prioridad 0), independientemente del orden JSX.

  return <PointerLockControls ref={controls} selector={lockSelector}
    minPolarAngle={0.05} maxPolarAngle={Math.PI - 0.05}
    onLock={() => {
      if (useGalleryStore.getState().isInspecting) controls.current?.unlock()
    }} />
}
