import type { ArtworkData } from '../types/gallery.ts'

export const ROOM_CAPACITY = 7
export const MAX_ROOM_CAPACITY = 14
export const ROOM_PALETTES = [
  { name: 'Verde salvia', wall: '#879780', partition: '#4b604b' },
  { name: 'Rojo granate', wall: '#95564f', partition: '#603431' },
  { name: 'Tierra tostada', wall: '#947b65', partition: '#624a37' },
] as const

/** Los enlaces son índices de la lista: el último vuelve al primero. */
export function createGalleryRooms(catalog: readonly ArtworkData[], hasArtistRoom = false) {
  if (!catalog.length) throw new Error('No hay obras para crear salas.')
  const paintings = catalog.filter((artwork) => artwork.collection !== 'Stone_Room')
  const stoneWorks = catalog.filter((artwork) => artwork.collection === 'Stone_Room')
  const rooms: { type: 'gallery' | 'artist' | 'collection'; name: string; palette: { name: string; wall: string; partition: string }; artworks: ArtworkData[] }[] = Array.from({ length: Math.ceil(paintings.length / ROOM_CAPACITY) }, (_, index) => ({
    type: 'gallery' as const,
    name: ROOM_PALETTES[index % ROOM_PALETTES.length].name,
    palette: ROOM_PALETTES[index % ROOM_PALETTES.length],
    artworks: paintings.slice(index * ROOM_CAPACITY, (index + 1) * ROOM_CAPACITY),
  }))
  if (hasArtistRoom) rooms.push({
    type: 'artist',
    name: 'Diana Carranza Lucatero',
    palette: { name: 'Sala editorial', wall: '#e8dfd2', partition: '#9b8068' },
    artworks: [],
  })
  if (stoneWorks.length) rooms.push({
    type: 'collection',
    name: 'Memoria en la madera',
    palette: { name: 'Memoria en la madera', wall: '#887967', partition: '#594637' },
    artworks: stoneWorks,
  })
  return rooms.map((room, index) => ({
    ...room,
    index,
    next: (index + 1) % rooms.length,
    previous: (index + rooms.length - 1) % rooms.length,
    artworks: room.artworks.map((artwork, slotIndex) => ({ ...artwork, slotIndex })),
  }))
}

export type GalleryRoom = ReturnType<typeof createGalleryRooms>[number]
