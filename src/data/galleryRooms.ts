import type { ArtworkData } from '../types/gallery.ts'

export const ROOM_CAPACITY = 7
export const MAX_ROOM_CAPACITY = 14
export const ROOM_PALETTES = [
  { name: 'Verde salvia', wall: '#879780', partition: '#4b604b' },
  { name: 'Rojo granate', wall: '#95564f', partition: '#603431' },
  { name: 'Tierra tostada', wall: '#947b65', partition: '#624a37' },
] as const

/** Los enlaces son índices de la lista: el último vuelve al primero. */
export function createGalleryRooms(catalog: readonly ArtworkData[]) {
  if (!catalog.length) throw new Error('No hay obras para crear salas.')
  const count = Math.ceil(catalog.length / ROOM_CAPACITY)
  return Array.from({ length: count }, (_, index) => ({
    index,
    next: (index + 1) % count,
    previous: (index + count - 1) % count,
    palette: ROOM_PALETTES[index % ROOM_PALETTES.length],
    artworks: catalog.slice(index * ROOM_CAPACITY, (index + 1) * ROOM_CAPACITY)
      .map((artwork, slotIndex) => ({ ...artwork, slotIndex })),
  }))
}

export type GalleryRoom = ReturnType<typeof createGalleryRooms>[number]
