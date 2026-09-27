import { useEffect, useRef, useState } from 'react'
import { Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3 } from 'three'
import type { BufferGeometry, Texture } from 'three'
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

function makeArtistCardTexture(card: ArtistGalleryCard, aspect: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = Math.round(canvas.width / aspect)
  const context = canvas.getContext('2d')!
  context.fillStyle = '#f5f1ea'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#9b8068'
  context.fillRect(64, 70, canvas.width - 128, 2)
  context.fillStyle = '#9b8068'
  context.font = '600 24px Arial, sans-serif'
  context.fillText(card.eyebrow.toLocaleUpperCase('es-MX'), 70, 124)
  context.fillStyle = '#171613'
  context.font = '52px Georgia, serif'
  const titleLines = wrap(context, card.title, canvas.width - 140)
  titleLines.forEach((line, index) => context.fillText(line, 70, 210 + index * 60))
  let fontSize = 32
  let bodyLines: string[] = []
  const bodyTop = 250 + titleLines.length * 60
  do {
    context.font = `${fontSize}px Georgia, serif`
    bodyLines = card.text.split(/\n\s*\n/).flatMap((paragraph) => [...wrap(context, paragraph, canvas.width - 140), ''])
    if (bodyLines.length * fontSize * 1.38 <= canvas.height - bodyTop - 110) break
    fontSize -= 1
  } while (fontSize > 21)
  context.font = `${fontSize}px Georgia, serif`
  const lineHeight = fontSize * 1.38
  bodyLines.forEach((line, index) => context.fillText(line, 70, bodyTop + (index + 1) * lineHeight))
  context.fillStyle = '#9b8068'
  context.fillRect(70, canvas.height - 96, canvas.width - 140, 2)
  context.font = '20px Arial, sans-serif'
  context.fillText('DIANA CARRANZA LUCATERO', 70, canvas.height - 56)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.flipY = false
  return texture
}

function fitPhotoGeometry(mesh: Mesh, aspect: number) {
  const geometry = mesh.geometry.clone()
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const center = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  const horizontal = size.x >= size.z ? 'x' : 'z'
  const width = Math.max(size.x, size.z)
  const height = size.y
  const targetWidth = Math.min(width, height * aspect)
  const targetHeight = Math.min(height, targetWidth / aspect)
  const scale = targetWidth / width
  geometry.translate(-center.x, -center.y, -center.z)
  geometry.scale(horizontal === 'x' ? scale : 1, targetHeight / height, horizontal === 'z' ? scale : 1)
  geometry.translate(center.x, center.y, center.z)
  return geometry
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
    const storyTextures: Texture[] = []
    const storyMaterials: MeshBasicMaterial[] = []
    const storyGeometries: BufferGeometry[] = []
    if (room.type === 'artist') {
      const pairs = [
        ['Artwork_07', 'Frame_07', 'Artwork_09', 'Frame_09'],
        ['Artwork_08', 'Frame_08', 'Artwork_10', 'Frame_10'],
        ['Artwork_11', 'Frame_11', 'Artwork_13', 'Frame_13'],
        ['Artwork_12', 'Frame_12', 'Artwork_14', 'Frame_14'],
      ] as const
      artistCards.forEach((card, index) => {
        const [imageName, imageFrameName, textName, textFrameName] = pairs[index]
        if (!imageName) return
        const imagePlane = prepared.scene.getObjectByName(imageName) as Mesh
        const imageFrame = prepared.scene.getObjectByName(imageFrameName) as Mesh
        const textPlane = prepared.scene.getObjectByName(textName) as Mesh
        const textFrame = prepared.scene.getObjectByName(textFrameName) as Mesh
        const photoTexture = artistImages[index].clone()
        photoTexture.colorSpace = SRGBColorSpace
        photoTexture.flipY = false
        const photo = photoTexture.image as CanvasImageSource & { width: number; height: number }
        const textGeometry = textPlane.geometry.clone()
        textGeometry.computeBoundingBox()
        const textSize = textGeometry.boundingBox!.getSize(new Vector3())
        const textTexture = makeArtistCardTexture(card, (textSize.x || textSize.z) / textSize.y)
        storyTextures.push(photoTexture, textTexture)
        const photoMaterial = new MeshBasicMaterial({ map: photoTexture, side: DoubleSide })
        const textMaterial = new MeshBasicMaterial({ map: textTexture, side: DoubleSide })
        storyMaterials.push(photoMaterial, textMaterial)
        const photoPanel = imagePlane.clone()
        photoPanel.geometry = fitPhotoGeometry(imagePlane, photo.width / photo.height)
        photoPanel.material = photoMaterial
        photoPanel.visible = true
        photoPanel.name = `Artist_Photo_${index}`
        photoPanel.userData.artistCard = card
        prepared.scene.attach(photoPanel)
        const textPanel = textPlane.clone()
        textPanel.geometry = textGeometry
        textPanel.material = textMaterial
        textPanel.visible = true
        textPanel.name = `Artist_Text_${index}`
        prepared.scene.attach(textPanel)
        for (const [sourceFrame, name] of [[imageFrame, `Artist_Photo_Frame_${index}`], [textFrame, `Artist_Text_Frame_${index}`]] as const) {
          const panelFrame = sourceFrame.clone()
          panelFrame.geometry = sourceFrame.geometry.clone()
          const frameMaterial = new MeshBasicMaterial({ color: '#a7834e', side: DoubleSide })
          storyMaterials.push(frameMaterial)
          panelFrame.material = frameMaterial
          panelFrame.name = name
          panelFrame.visible = true
          prepared.scene.attach(panelFrame)
          storyGeometries.push(panelFrame.geometry)
        }
        storyGeometries.push(photoPanel.geometry, textPanel.geometry)
      })
      const disposePrepared = prepared.dispose
      prepared.dispose = () => {
        storyTextures.forEach((texture) => texture.dispose())
        storyMaterials.forEach((material) => material.dispose())
        storyGeometries.forEach((geometry) => geometry.dispose())
        disposePrepared()
      }
    }
    if (room.type !== 'collection') {
      const house = houseSource.clone(true)
      house.name = 'Casita_Madriguera_Interactiva'
      house.userData.interactive_house = true
      house.position.set(3.25, 0, 6.75)
      house.scale.setScalar(2)
      house.rotation.y = -Math.PI / 2
      prepared.scene.add(house)
    }
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
