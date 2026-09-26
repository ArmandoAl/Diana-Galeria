import { useEffect, useRef, useState } from 'react'
import { Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace } from 'three'
import { prepareGallery } from '../../controllers/prepareGallery.ts'
import { PlayerRig } from './PlayerRig.tsx'
import { AudioManager } from '../audio/AudioManager.tsx'
import type { AudioEngine } from '../../audio/AudioEngine.ts'
import type { ArtworkData, AudioConfig } from '../../types/gallery.ts'
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

function makeArtistCardTexture(card: ArtistGalleryCard, image: CanvasImageSource & { width: number; height: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 1200
  const context = canvas.getContext('2d')!
  context.fillStyle = '#f5f1ea'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const crop = Math.min(image.width, image.height * 2.15)
  context.drawImage(image, (image.width - crop) / 2, (image.height - crop / 2.15) / 2, crop, crop / 2.15, 48, 42, 804, 375)
  context.fillStyle = '#9b8068'
  context.font = '600 24px Arial, sans-serif'
  context.fillText(card.eyebrow.toLocaleUpperCase('es-MX'), 58, 478)
  context.fillStyle = '#171613'
  context.font = '48px Georgia, serif'
  const titleLines = wrap(context, card.title, 780)
  titleLines.slice(0, 2).forEach((line, index) => context.fillText(line, 58, 540 + index * 56))
  context.font = '26px Georgia, serif'
  const bodyLines = wrap(context, card.text, 780)
  bodyLines.slice(0, 9).forEach((line, index) => context.fillText(line, 58, 690 + index * 42))
  context.fillStyle = '#9b8068'
  context.fillRect(58, 1114, 784, 2)
  context.font = '20px Arial, sans-serif'
  context.fillText('DIANA CARRANZA LUCATERO', 58, 1155)
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
  const [gallery, setGallery] = useState<(ReturnType<typeof prepareGallery> & { artworks: readonly ArtworkData[]; direction: -1 | 1 }) | null>(null)
  const audioEngineRef = useRef<AudioEngine | null>(null)
  useEffect(() => {
    const selected = room.artworks.map((artwork) => images[artworks.findIndex((entry) => entry.id === artwork.id)])
    const prepared = prepareGallery(source, lightmap, room.artworks, selected, room.palette)
    const story = artistCards.find((card) => card.roomIndex === room.index)
    if (story) {
      const photo = artistImages[artistCards.indexOf(story)].image as CanvasImageSource & { width: number; height: number }
      const texture = makeArtistCardTexture(story, photo)
      const imagePlane = prepared.scene.getObjectByName('Artwork_08') as Mesh
      const frame = prepared.scene.getObjectByName('Frame_08') as Mesh
      const panel = imagePlane.clone()
      panel.geometry = imagePlane.geometry.clone()
      const panelMaterial = new MeshBasicMaterial({ map: texture, side: DoubleSide })
      panel.material = panelMaterial
      panel.visible = true
      panel.name = 'Artist_Presentation_Card'
      panel.userData.artistCard = story
      prepared.scene.attach(panel)
      const panelFrame = frame.clone()
      panelFrame.geometry = frame.geometry.clone()
      const frameMaterial = new MeshBasicMaterial({ color: '#a7834e', side: DoubleSide })
      panelFrame.material = frameMaterial
      panelFrame.name = 'Artist_Presentation_Frame'
      panelFrame.visible = true
      prepared.scene.attach(panelFrame)
      // dispose(): remove the card's canvas texture and copied meshes with this room instance.
      const disposePrepared = prepared.dispose
      prepared.dispose = () => {
        texture.dispose()
        panel.geometry.dispose()
        panelMaterial.dispose()
        panelFrame.geometry.dispose()
        frameMaterial.dispose()
        disposePrepared()
      }
    }
    const house = houseSource.clone(true)
    house.name = 'Casita_Madriguera_Interactiva'
    house.userData.interactive_house = true
    house.position.set(3.25, 0, 6.75)
    house.scale.setScalar(2)
    house.rotation.y = -Math.PI / 2
    prepared.scene.add(house)
    // Recursos GPU con ciclo de vida de efecto, incluidas las remontadas de StrictMode.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGallery({ ...prepared, artworks: room.artworks, direction })
    return () => {
      prepared.dispose()
    }
  }, [source, houseSource, lightmap, artworks, artistCards, artistImages, images, room, visit, direction])
  useEffect(() => { if (gallery) onReady() }, [gallery, onReady])

  if (!gallery) return null
  return <>
    <primitive object={gallery.scene} dispose={null} />
    <PlayerRig scene={gallery.scene} collider={gallery.collider} artworks={gallery.artworks} audioEngineRef={audioEngineRef} onLockChange={onLockChange}
      onDoor={onDoor} spawn={[0, 0, gallery.direction === 1 ? 6.2 : -6.2]} facing={gallery.direction === 1 ? 0 : Math.PI} />
    <AudioManager scene={gallery.scene} artworks={gallery.artworks} engineRef={audioEngineRef} config={audioConfig} onError={onAudioError} />
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
