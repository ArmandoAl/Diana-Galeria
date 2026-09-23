import { useEffect, useRef, useState } from 'react'
import { Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { prepareGallery } from '../../controllers/prepareGallery.ts'
import { PlayerRig } from './PlayerRig.tsx'
import { AudioManager } from '../audio/AudioManager.tsx'
import type { AudioEngine } from '../../audio/AudioEngine.ts'
import type { ArtworkData, AudioConfig } from '../../types/gallery.ts'
import type { GalleryRoom } from '../../data/galleryRooms.ts'

interface Props {
  artworks: readonly ArtworkData[]
  room: GalleryRoom
  visit: number
  direction: -1 | 1
  onDoor: (direction: -1 | 1) => void
  audioConfig: AudioConfig
  onReady: () => void
  onLockChange: (locked: boolean) => void
  onAudioError: (error: Error) => void
}

export function MunalGalleryScene({ artworks, room, visit, direction, onDoor, audioConfig, onReady, onLockChange, onAudioError }: Props) {
  const base = import.meta.env.BASE_URL
  const { scene: source } = useGLTF(`${base}models/munal_gallery_daylight.glb`)
  const lightmap = useTexture(`${base}textures/munal_daylight_lightmap.png`)
  // ponytail: catálogo pequeño precargado para conservar Pointer Lock; usar streaming si crece más allá de ~40 imágenes de tamaño web.
  const images = useTexture(artworks.map((artwork) => `${base}${artwork.imagePath.slice(1)}`))
  const [gallery, setGallery] = useState<(ReturnType<typeof prepareGallery> & { artworks: readonly ArtworkData[]; direction: -1 | 1 }) | null>(null)
  const audioEngineRef = useRef<AudioEngine | null>(null)
  useEffect(() => {
    const selected = room.artworks.map((artwork) => images[artworks.findIndex((entry) => entry.id === artwork.id)])
    const prepared = prepareGallery(source, lightmap, room.artworks, selected, room.palette)
    // Recursos GPU con ciclo de vida de efecto, incluidas las remontadas de StrictMode.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGallery({ ...prepared, artworks: room.artworks, direction })
    return prepared.dispose
  }, [source, lightmap, artworks, images, room, visit, direction])
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
