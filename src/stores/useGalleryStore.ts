import { Vector3 } from 'three'
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { ArtworkData, PlayerTransform } from '../types/gallery.ts'

export interface GalleryState extends PlayerTransform {
  /** Rapidez horizontal real tras colisiones, no reactiva, en m/s. */
  rawSpeed: number
  activeArtwork: ArtworkData | null
  nearbyArtwork: ArtworkData | null
  isNearArtwork: boolean
  isInspecting: boolean
  openArtworkModal: (artwork: ArtworkData) => void
  closeArtworkModal: () => void
  setNearArtwork: (artwork: ArtworkData | null) => void
  updatePlayerTransform: (position: Vector3, velocity: Vector3, grounded: boolean, speed?: number) => void
}

export const useGalleryStore = create<GalleryState>()(
  subscribeWithSelector((set, get) => ({
    activeArtwork: null,
    nearbyArtwork: null,
    isNearArtwork: false,
    isInspecting: false,
    rawPosition: new Vector3(),
    rawVelocity: new Vector3(),
    isGrounded: false,
    rawSpeed: 0,

    openArtworkModal: (artwork) => {
      if (get().isInspecting && get().activeArtwork === artwork) return
      set({ activeArtwork: artwork, isInspecting: true })
    },
    closeArtworkModal: () => {
      if (!get().isInspecting) return
      set({ activeArtwork: null, isInspecting: false })
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
