import type { ArtistProfile } from '../types/artist'

export async function loadArtistProfile(signal?: AbortSignal): Promise<ArtistProfile> {
  const response = await fetch(`${import.meta.env.BASE_URL}author/author.json`, { signal })
  if (!response.ok) throw new Error(`No se pudo cargar la presentación de la artista (HTTP ${response.status}).`)
  return response.json() as Promise<ArtistProfile>
}
