import type { Vector3 } from 'three'

export type ArtworkSlotIndex = number

export interface ArtworkData {
  readonly id: string
  readonly slotIndex: ArtworkSlotIndex
  readonly title: string
  readonly artist: string
  readonly year: string
  readonly technique: string
  readonly dimensions: string
  readonly description: string
  readonly imagePath: string
  readonly isSpecial: boolean
}

/** Estado mutable del motor FPS; metros y metros/segundo, coordenadas Three.js. */
export interface PlayerTransform {
  readonly rawPosition: Vector3
  readonly rawVelocity: Vector3
  isGrounded: boolean
}

export interface AudioConfig {
  readonly muted: boolean
  /** Ganancias lineales entre 0 y 1. */
  readonly masterVolume: number
  readonly ambientVolume: number
  readonly footstepsVolume: number
}
