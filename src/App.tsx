import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { loadArtworks } from './data/loadArtworks.ts'
import { loadArtistProfile } from './data/loadArtistProfile.ts'
import { createGalleryRooms } from './data/galleryRooms.ts'
import { useGalleryStore } from './stores/useGalleryStore.ts'
import { DEFAULT_AUDIO_CONFIG } from './audio/AudioEngine.ts'
import type { ArtworkData } from './types/gallery.ts'
import type { ArtistProfile } from './types/artist.ts'
import { CuratorOverlay } from './components/ui/CuratorOverlay.tsx'
import './App.css'

const GalleryScene = lazy(() => import('./components/3d/MunalGalleryScene.tsx')
  .then((module) => ({ default: module.MunalGalleryScene })))

class SceneBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { this.props.onError(error) }
  render() { return this.state.failed ? null : this.props.children }
}

export default function App() {
  const [artworks, setArtworks] = useState<readonly ArtworkData[] | null>(null)
  const [artist, setArtist] = useState<ArtistProfile | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [ready, setReady] = useState(false)
  const [locked, setLocked] = useState(false)
  const [muted, setMuted] = useState(false)
  const [roomIndex, setRoomIndex] = useState(0)
  const [visit, setVisit] = useState(0)
  const [travelDirection, setTravelDirection] = useState<-1 | 1>(1)
  const [arrivalDirection, setArrivalDirection] = useState<-1 | 1>(1)
  const [phase, setPhase] = useState<'idle' | 'out' | 'loading' | 'in'>('idle')
  const rooms = useMemo(() => artworks ? createGalleryRooms(artworks, artist?.galleryCards) : [], [artworks, artist])
  const audioConfig = useMemo(() => ({ ...DEFAULT_AUDIO_CONFIG, muted }), [muted])
  const onReady = useCallback(() => {
    setReady(true)
    setPhase((current) => current === 'loading' ? 'in' : current)
  }, [])
  const onDoor = useCallback((direction: -1 | 1) => {
    const state = useGalleryStore.getState()
    if (state.isTransitioning || state.isInspecting) return
    state.setTransitioning(true)
    setTravelDirection(direction)
    setPhase('out')
  }, [])
  useEffect(() => {
    if (phase === 'idle') { useGalleryStore.getState().setTransitioning(false); return }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (phase === 'out') {
      const timer = window.setTimeout(() => {
        setRoomIndex((index) => travelDirection === 1 ? rooms[index].next : rooms[index].previous)
        setArrivalDirection(travelDirection)
        setVisit((value) => value + 1)
        setPhase('loading')
      }, reduced ? 0 : 350)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'in') {
      const timer = window.setTimeout(() => setPhase('idle'), reduced ? 0 : 350)
      return () => window.clearTimeout(timer)
    }
  }, [phase, rooms, travelDirection])
  useEffect(() => () => useGalleryStore.getState().setTransitioning(false), [])
  const onAudioError = useCallback((error: Error) => {
    console.warn('[MUNAL audio]', error)
    // No interrumpir la experiencia con un banner invasivo: el icono de audio en el header refleja el estado
    setMuted(true)
  }, [])
  const onSceneError = useCallback((error: Error) => {
    useGalleryStore.getState().closeArtworkModal()
    useGalleryStore.getState().setTransitioning(false)
    setPhase('idle')
    setFailure(error); setReady(false); setLocked(false)
  }, [])
  const retry = async () => {
    if (artworks) {
      // Suspense conserva también errores: descartar entradas fallidas antes de reintentar.
      const { useGLTF, useTexture } = await import('@react-three/drei')
      useGLTF.clear(import.meta.env.BASE_URL + 'models/munal_gallery_daylight.glb')
      useGLTF.clear(import.meta.env.BASE_URL + 'models/casita-madriguera.glb')
      useTexture.clear(import.meta.env.BASE_URL + 'textures/munal_daylight_lightmap.png')
      useTexture.clear(artworks.map((artwork) => import.meta.env.BASE_URL + artwork.imagePath.slice(1)))
      useTexture.clear(artist?.galleryCards.map((card) => import.meta.env.BASE_URL + card.imagePath.slice(1)) ?? [])
    }
    setFailure(null); setArtworks(null); setArtist(null); setReady(false); setRoomIndex(0); setVisit(0); setPhase('idle'); setAttempt((value) => value + 1)
  }

  useEffect(() => {
    const abort = new AbortController()
    // Vite puede devolver index.html para assets ausentes: detectarlo antes del loader.
    const check = async (path: string) => {
      const response = await fetch(import.meta.env.BASE_URL + path, { method: 'HEAD', signal: abort.signal })
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
        throw new Error('Falta o no se puede cargar public/' + path + '. Coloca el asset definitivo en esa ruta.')
      }
    }
    void Promise.all([
      loadArtworks(abort.signal), loadArtistProfile(abort.signal), check('models/munal_gallery_daylight.glb'), check('models/casita-madriguera.glb'), check('textures/munal_daylight_lightmap.png'),
    ]).then(([data, profile]) => { if (!abort.signal.aborted) { setArtworks(data); setArtist(profile) } })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) onSceneError(error instanceof Error ? error : new Error(String(error)))
      })
    return () => abort.abort()
  }, [attempt, onSceneError])

  useEffect(() => {
    const error = () => setNotice('No se pudo capturar el cursor. Usa Entrar / continuar en localhost o HTTPS.')
    document.addEventListener('pointerlockerror', error)
    return () => document.removeEventListener('pointerlockerror', error)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return
      if (e.code === 'KeyM' && !e.repeat) {
        setMuted((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return <main className="gallery-app">
    <div className="gallery-canvas" aria-label="Sala virtual del MUNAL">
      {artworks && artist && !failure && <SceneBoundary key={attempt} onError={onSceneError}>
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.65, 0], fov: 65, near: 0.05, far: 100 }}
          gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 1, outputColorSpace: SRGBColorSpace }}
          fallback={<p role="alert">WebGL no está disponible. Activa la aceleración gráfica.</p>}>
          <color attach="background" args={['#101a16']} />
          <Suspense fallback={null}>
            <GalleryScene artworks={artworks} artist={artist} room={rooms[roomIndex]} visit={visit} direction={arrivalDirection}
              audioConfig={audioConfig} onReady={onReady} onDoor={onDoor}
              onLockChange={setLocked} onAudioError={onAudioError} />
          </Suspense>
        </Canvas>
      </SceneBoundary>}
    </div>
    <CuratorOverlay artist={artist} ready={ready} locked={locked} failure={failure} notice={notice} muted={muted}
      roomIndex={roomIndex} roomCount={rooms.length} roomName={rooms[roomIndex]?.name} phase={phase}
      onToggleSound={() => setMuted((value) => !value)}
      onDismissNotice={() => setNotice('')}
      onRetry={() => { void retry().catch(onSceneError) }} />
  </main>
}
