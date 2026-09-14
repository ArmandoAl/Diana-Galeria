import type { ArtworkData } from '../types/gallery.ts'

const textFields = [
  'id', 'title', 'artist', 'year', 'technique', 'dimensions', 'description', 'imagePath',
] as const

/** Valida el JSON externo antes de introducirlo en el estado de la aplicación. */
export function parseArtworks(value: unknown): readonly ArtworkData[] {
  if (!Array.isArray(value) || value.length !== 8) {
    throw new Error('El catálogo debe contener exactamente 8 obras.')
  }
  const ids = new Set<string>()
  const slots = new Set<number>()
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('Ficha de obra inválida.')
    }
    const item = entry as Record<string, unknown>
    if (textFields.some((key) => typeof item[key] !== 'string' || !item[key].trim())) {
      throw new Error('Todas las fichas requieren campos de texto no vacíos.')
    }
    const { id, slotIndex, imagePath, isSpecial } = item
    if (typeof id !== 'string' || typeof slotIndex !== 'number'
      || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 7
      || ids.has(id) || slots.has(slotIndex)) {
      throw new Error('Cada obra requiere un id único y un slotIndex único entre 0 y 7.')
    }
    if (typeof isSpecial !== 'boolean' || isSpecial !== (slotIndex === 6)) {
      throw new Error('Solo la obra 7 (slotIndex 6) debe ser especial.')
    }
    if (typeof imagePath !== 'string' || !/^\/artworks\/[\w-]+\.(?:jpe?g|png|webp|avif)$/i.test(imagePath)) {
      throw new Error('imagePath debe señalar una imagen local dentro de /artworks/.')
    }
    ids.add(id)
    slots.add(slotIndex)
  }
  return value as ArtworkData[]
}

export async function loadArtworks(signal?: AbortSignal): Promise<readonly ArtworkData[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/artworks.json`, { signal })
  if (!response.ok) throw new Error(`No se pudo cargar el catálogo (HTTP ${response.status}).`)
  return parseArtworks(await response.json())
}
