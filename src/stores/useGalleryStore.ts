import { Vector3 } from 'three'
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { ArtworkData, PlayerTransform } from '../types/gallery.ts'

export interface GalleryState extends PlayerTransform {
  /** Rapidez horizontal real tras colisiones, no reactiva, en m/s. */
  rawSpeed: number
  activeArtwork: ArtworkData | null
  isHousePhotosOpen: boolean
  nearbyArtwork: ArtworkData | null
  isNearArtwork: boolean
  isNearHouse: boolean
  isInspecting: boolean
  isTransitioning: boolean
  nearbyDoor: -1 | 1 | null
  isMobile: boolean
  isExploring: boolean
  touchMove: { x: number; y: number }
  touchRunning: boolean
  interactionTrigger: number
  touchLookDelta: { x: number; y: number }
  setIsMobile: (mobile: boolean) => void
  setIsExploring: (exploring: boolean) => void
  setTouchMove: (move: { x: number; y: number }) => void
  setTouchRunning: (running: boolean) => void
  addTouchLookDelta: (dx: number, dy: number) => void
  consumeTouchLookDelta: () => { x: number; y: number }
  triggerInteraction: () => void
  setTransitioning: (active: boolean) => void
  setNearDoor: (direction: -1 | 1 | null) => void
  openArtworkModal: (artwork: ArtworkData) => void
  openHousePhotos: () => void
  setNearHouse: (near: boolean) => void
  closeArtworkModal: () => void
  setNearArtwork: (artwork: ArtworkData | null) => void
  updatePlayerTransform: (position: Vector3, velocity: Vector3, grounded: boolean, speed?: number) => void
}

export const useGalleryStore = create<GalleryState>()(
  subscribeWithSelector((set, get) => ({
    activeArtwork: null,
    isHousePhotosOpen: false,
    nearbyArtwork: null,
    isNearArtwork: false,
    isNearHouse: false,
    isInspecting: false,
    isTransitioning: false,
    nearbyDoor: null,
    isMobile: false,
    isExploring: false,
    touchMove: { x: 0, y: 0 },
    touchRunning: false,
    interactionTrigger: 0,
    touchLookDelta: { x: 0, y: 0 },
    setIsMobile: (mobile) => set({ isMobile: mobile }),
    setIsExploring: (exploring) => set({ isExploring: exploring }),
    setTouchMove: (move) => {
      const current = get().touchMove
      current.x = move.x
      current.y = move.y
    },
    setTouchRunning: (running) => set({ touchRunning: running }),
    addTouchLookDelta: (dx, dy) => {
      const current = get().touchLookDelta
      current.x += dx
      current.y += dy
    },
    consumeTouchLookDelta: () => {
      const delta = get().touchLookDelta
      const res = { x: delta.x, y: delta.y }
      delta.x = 0
      delta.y = 0
      return res
    },
    triggerInteraction: () => set((state) => ({ interactionTrigger: state.interactionTrigger + 1 })),
    setTransitioning: (active) => set({ isTransitioning: active, nearbyDoor: null, nearbyArtwork: null, isNearArtwork: false, isNearHouse: false }),
    setNearDoor: (direction) => {
      if (get().nearbyDoor !== direction) set({ nearbyDoor: direction })
    },
    rawPosition: new Vector3(),
    rawVelocity: new Vector3(),
    isGrounded: false,
    rawSpeed: 0,

    openArtworkModal: (artwork) => {
      if (get().isInspecting && get().activeArtwork === artwork) return
      set({ activeArtwork: artwork, isHousePhotosOpen: false, isInspecting: true })
    },
    openHousePhotos: () => set({ activeArtwork: null, isHousePhotosOpen: true, isInspecting: true }),
    setNearHouse: (near) => { if (get().isNearHouse !== near) set({ isNearHouse: near }) },
    closeArtworkModal: () => {
      if (!get().isInspecting) return
      set({ activeArtwork: null, isHousePhotosOpen: false, isInspecting: false })
    },
    setNearArtwork: (artwork) => {
      if (get().nearbyArtwork === artwork) return
      // La proximidad nunca reemplaza la ficha que ya se está leyendo.
      set({ nearbyArtwork: artwork, isNearArtwork: artwork !== null })
    },
    updatePlayerTransform: (position, velocity, grounded, speed = Math.hypot(velocity.x, velocity.z)) => {
      // Mutación deliberada: este canal no notifica a React ni a subscribe.
      // Leer con getState() dentro de useFrame; no usar selectores para física.
      const state = get()
      state.rawPosition.copy(position)
      state.rawVelocity.copy(velocity)
      state.isGrounded = grounded
      state.rawSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0
    },
  })),
)
