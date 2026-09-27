import { useEffect, useRef, useState } from 'react'
import { Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Texture } from 'three'
import { prepareGallery } from '../../controllers/prepareGallery.ts'
import { PlayerRig } from './PlayerRig.tsx'
import { AudioManager } from '../audio/AudioManager.tsx'
import type { AudioEngine } from '../../audio/AudioEngine.ts'
import type { ArtworkData, AudioConfig, GalleryMount } from '../../types/gallery.ts'
import type { GalleryRoom } from '../../data/galleryRooms.ts'
import type { ArtistGalleryCard, ArtistProfile } from '../../types/artist.ts'

interface Props {
  artworks: readonly ArtworkData[]
  artist: ArtistProfile
  room: GalleryRoom
  visit: number
  direction: -1 | 1
  onDoor: (direction: -1 | 1) => void
  audioConfig: AudioConfig
  onReady: () => void
  onLockChange: (locked: boolean) => void
  onAudioError: (error: Error) => void
}

const EMPTY_ARTIST_CARDS: readonly ArtistGalleryCard[] = []

function makeArtistCardTexture(card: ArtistGalleryCard, photo: CanvasImageSource & { width: number; height: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = 1800
  canvas.height = 1200
  const context = canvas.getContext('2d')!
  context.fillStyle = '#f5f1ea'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#ebe4d9'
  context.fillRect(54, 54, 620, 1092)
  const photoScale = Math.min(584 / photo.width, 1056 / photo.height)
  const photoWidth = photo.width * photoScale
  const photoHeight = photo.height * photoScale
  context.drawImage(photo, 74 + (544 - photoWidth) / 2, 72 + (1056 - photoHeight) / 2, photoWidth, photoHeight)
  context.fillStyle = '#9b8068'
  context.fillRect(716, 70, 2, canvas.height - 140)
  context.font = '600 24px Arial, sans-serif'
  context.fillText(card.eyebrow.toLocaleUpperCase('es-MX'), 770, 132)
  context.fillStyle = '#171613'
  context.font = '52px Georgia, serif'
  const titleLines = wrap(context, card.title, 940)
  titleLines.forEach((line, index) => context.fillText(line, 770, 220 + index * 60))
  let fontSize = 30
  let bodyLines: string[]
  const bodyTop = 270 + titleLines.length * 60
  do {
    context.font = `${fontSize}px Georgia, serif`
    bodyLines = card.text.split(/\n\s*\n/).flatMap((paragraph) => [...wrap(context, paragraph, 940), ''])
    if (bodyLines.length * fontSize * 1.34 <= canvas.height - bodyTop - 90) break
    fontSize -= 1
  } while (fontSize > 17)
  context.font = `${fontSize}px Georgia, serif`
  const lineHeight = fontSize * 1.34
  bodyLines.forEach((line, index) => context.fillText(line, 770, bodyTop + (index + 1) * lineHeight))
  context.fillStyle = '#9b8068'
  context.fillRect(770, canvas.height - 82, 940, 2)
  context.font = '18px Arial, sans-serif'
  context.fillText('DIANA CARRANZA LUCATERO', 770, canvas.height - 46)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.flipY = false
  return texture
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && context.measureText(next).width > width) { lines.push(line); line = word }
    else line = next
  }
  if (line) lines.push(line)
  return lines
}

export function MunalGalleryScene({ artworks, artist, room, visit, direction, onDoor, audioConfig, onReady, onLockChange, onAudioError }: Props) {
  const base = import.meta.env.BASE_URL
  const artistCards = artist?.galleryCards ?? EMPTY_ARTIST_CARDS
  const { scene: source } = useGLTF(`${base}models/munal_gallery_daylight.glb`)
  const { scene: houseSource } = useGLTF(`${base}models/casita-madriguera.glb`)
  const lightmap = useTexture(`${base}textures/munal_daylight_lightmap.png`)
  // ponytail: catálogo pequeño precargado para conservar Pointer Lock; usar streaming si crece más allá de ~40 imágenes de tamaño web.
  const images = useTexture(artworks.map((artwork) => `${base}${artwork.imagePath.slice(1)}`))
  const artistImages = useTexture(artistCards.map((card) => `${base}${card.imagePath.slice(1)}`))
  const [gallery, setGallery] = useState<(ReturnType<typeof prepareGallery> & { mounts: readonly GalleryMount[]; direction: -1 | 1 }) | null>(null)
  const audioEngineRef = useRef<AudioEngine | null>(null)
  useEffect(() => {
    const storyTextures: Texture[] = []
    const mounts: GalleryMount[] = []
    const cardInterval = Math.ceil((room.artworks.length + 1) / (room.artistCards.length + 1))
    let paintingIndex = 0
    let cardIndex = 0
    while (paintingIndex < room.artworks.length || cardIndex < room.artistCards.length) {
      const nextCard = room.artistCards[cardIndex]
      const showCard = nextCard?.placement === 'first'
        ? paintingIndex === 0
        : cardIndex < room.artistCards.length && (paintingIndex === room.artworks.length || (paintingIndex > 0 && paintingIndex % cardInterval === 0))
      if (showCard) {
        const card = room.artistCards[cardIndex]
        const imageIndex = artistCards.findIndex((entry) => entry.imagePath === card.imagePath)
        const photo = artistImages[imageIndex]?.image as CanvasImageSource & { width: number; height: number } | undefined
        if (photo) {
          const texture = makeArtistCardTexture(card, photo)
          storyTextures.push(texture)
          mounts.push({ type: 'artist-card', data: card, texture, slotIndex: mounts.length })
        }
        cardIndex += 1
      } else {
        const artwork = room.artworks[paintingIndex++]
        mounts.push({ type: 'artwork', data: { ...artwork, slotIndex: mounts.length }, texture: images[artworks.findIndex((entry) => entry.id === artwork.id)], slotIndex: mounts.length })
      }
    }
    const prepared = prepareGallery(source, lightmap, mounts, room.palette)
    const disposePrepared = prepared.dispose
    prepared.dispose = () => { storyTextures.forEach((texture) => texture.dispose()); disposePrepared() }
    if (room.index === 1) {
      const house = houseSource.clone(true)
      house.name = 'Casita_Madriguera_Interactiva'
      house.userData.interactive_house = true
      house.position.set(2, 0, 6)
      house.scale.setScalar(2)
      house.rotation.y = -Math.PI / 2
      prepared.scene.add(house)
    }
    // Recursos GPU con ciclo de vida de efecto, incluidas las remontadas de StrictMode.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGallery({ ...prepared, mounts, direction })
    return () => {
      prepared.dispose()
    }
  }, [source, houseSource, lightmap, artworks, artistCards, artistImages, images, room, visit, direction])
  useEffect(() => { if (gallery) onReady() }, [gallery, onReady])

  if (!gallery) return null
  return <>
    <primitive object={gallery.scene} dispose={null} />
    <PlayerRig scene={gallery.scene} collider={gallery.collider} mounts={gallery.mounts} audioEngineRef={audioEngineRef} onLockChange={onLockChange}
      onDoor={onDoor} spawn={[0, 0, gallery.direction === 1 ? 6.2 : -6.2]} facing={gallery.direction === 1 ? 0 : Math.PI} />
    <AudioManager scene={gallery.scene} mounts={gallery.mounts} engineRef={audioEngineRef} config={audioConfig} onError={onAudioError} />
    {/* Captura estática de reflejos: sin luces dinámicas que dupliquen el bake ni shadow maps. */}
    <Environment frames={1} resolution={256} environmentIntensity={0.8}>
      <Lightformer position={[-4, 2.6, 0]} rotation={[0, Math.PI / 2, 0]}
        scale={[14, 3.2, 1]} color="#e5eeff" intensity={2} />
      <Lightformer position={[4, 2.6, 0]} rotation={[0, -Math.PI / 2, 0]}
        scale={[14, 3.2, 1]} color="#fff2dc" intensity={1.5} />
    </Environment>
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO quality="medium" halfRes aoRadius={0.25} intensity={0.45} distanceFalloff={1} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  </>
}
