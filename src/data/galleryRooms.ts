import type { ArtworkData } from '../types/gallery.ts'
import type { ArtistGalleryCard } from '../types/artist.ts'

export const ROOM_CAPACITY = 7
export const MAX_ROOM_CAPACITY = 14
export const ROOM_PALETTES = [
  { name: 'Verde salvia', wall: '#879780', partition: '#4b604b' },
  { name: 'Rojo granate', wall: '#95564f', partition: '#603431' },
  { name: 'Tierra tostada', wall: '#947b65', partition: '#624a37' },
] as const

/** Los enlaces son índices de la lista: el último vuelve al primero. */
export function createGalleryRooms(catalog: readonly ArtworkData[], artistCards: readonly ArtistGalleryCard[] = []) {
  if (!catalog.length) throw new Error('No hay obras para crear salas.')
  const paintings = catalog.filter((artwork) => artwork.collection !== 'Stone_Room')
  const stoneWorks = catalog.filter((artwork) => artwork.collection === 'Stone_Room')
  const rooms: { type: 'gallery' | 'collection'; name: string; palette: { name: string; wall: string; partition: string }; artworks: ArtworkData[]; artistCards: ArtistGalleryCard[] }[] = Array.from({ length: Math.ceil(paintings.length / ROOM_CAPACITY) }, (_, index) => ({
    type: 'gallery' as const,
    name: ROOM_PALETTES[index % ROOM_PALETTES.length].name,
    palette: ROOM_PALETTES[index % ROOM_PALETTES.length],
    artworks: paintings.slice(index * ROOM_CAPACITY, (index + 1) * ROOM_CAPACITY),
    artistCards: [],
  }))
  const featuredCard = artistCards.find((card) => card.placement === 'first')
  if (featuredCard && rooms[0]) rooms[0].artistCards.push(featuredCard)
  for (const card of artistCards.filter((entry) => entry !== featuredCard)) {
    const room = rooms.filter((entry) => entry.type === 'gallery' && entry.artworks.length + entry.artistCards.length < MAX_ROOM_CAPACITY)
      .sort((a, b) => a.artworks.length + a.artistCards.length - (b.artworks.length + b.artistCards.length))[0]
    if (room) room.artistCards.push(card)
  }
  if (stoneWorks.length) rooms.push({
    type: 'collection',
    name: 'Memoria en la madera',
    palette: { name: 'Memoria en la madera', wall: '#887967', partition: '#594637' },
    artworks: stoneWorks,
    artistCards: [],
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
