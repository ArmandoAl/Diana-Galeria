import { useEffect, useState } from 'react'
import { Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { prepareGallery } from '../../controllers/prepareGallery.ts'
import { PlayerRig } from './PlayerRig.tsx'
import { AudioManager } from '../audio/AudioManager.tsx'
import type { ArtworkData, AudioConfig } from '../../types/gallery.ts'

interface Props {
  artworks: readonly ArtworkData[]
  audioConfig: AudioConfig
  onReady: () => void
  onLockChange: (locked: boolean) => void
  onAudioError: (error: Error) => void
}

export function MunalGalleryScene({ artworks, audioConfig, onReady, onLockChange, onAudioError }: Props) {
  const base = import.meta.env.BASE_URL
  const { scene: source } = useGLTF(`${base}models/munal_gallery.glb`)
  const lightmap = useTexture(`${base}textures/munal_room_lightmap.png`)
  const images = useTexture(artworks.map((artwork) => `${base}${artwork.imagePath.slice(1)}`))
  const [gallery, setGallery] = useState<ReturnType<typeof prepareGallery> | null>(null)
  useEffect(() => {
    const prepared = prepareGallery(source, lightmap, artworks, images)
    // Recursos GPU con ciclo de vida de efecto, incluidas las remontadas de StrictMode.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGallery(prepared)
    onReady()
    return prepared.dispose
  }, [source, lightmap, artworks, images, onReady])

  if (!gallery) return null
  return <>
    <primitive object={gallery.scene} dispose={null} />
    <PlayerRig scene={gallery.scene} collider={gallery.collider} artworks={artworks} onLockChange={onLockChange} />
    <AudioManager scene={gallery.scene} artworks={artworks} config={audioConfig} onError={onAudioError} />
    {/* Captura estática de reflejos: sin luces dinámicas que dupliquen el bake ni shadow maps. */}
    <Environment frames={1} resolution={128} environmentIntensity={0.2}>
      <Lightformer position={[0, 5.2, 0]} rotation={[Math.PI / 2, 0, 0]}
        scale={[3, 10, 1]} color="#ffe0b2" intensity={3} />
    </Environment>
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO quality="performance" halfRes aoRadius={0.15} intensity={0.6} distanceFalloff={1} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  </>
}
