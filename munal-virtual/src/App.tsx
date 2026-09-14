import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { loadArtworks } from './data/loadArtworks.ts'
import { useGalleryStore } from './stores/useGalleryStore.ts'
import { DEFAULT_AUDIO_CONFIG } from './audio/AudioEngine.ts'
import type { ArtworkData } from './types/gallery.ts'
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
  const [failure, setFailure] = useState<Error | null>(null)
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [ready, setReady] = useState(false)
  const [locked, setLocked] = useState(false)
  const [muted, setMuted] = useState(false)
  const audioConfig = useMemo(() => ({ ...DEFAULT_AUDIO_CONFIG, muted }), [muted])
  const onReady = useCallback(() => setReady(true), [])
  const onAudioError = useCallback((error: Error) => setNotice('Audio: ' + error.message), [])
  const onSceneError = useCallback((error: Error) => {
    useGalleryStore.getState().closeArtworkModal()
    setFailure(error); setReady(false); setLocked(false)
  }, [])
  const retry = async () => {
    if (artworks) {
      // Suspense conserva también errores: descartar entradas fallidas antes de reintentar.
      const { useGLTF, useTexture } = await import('@react-three/drei')
      useGLTF.clear(import.meta.env.BASE_URL + 'models/munal_gallery.glb')
      useTexture.clear(import.meta.env.BASE_URL + 'textures/munal_room_lightmap.png')
      useTexture.clear(artworks.map((artwork) => import.meta.env.BASE_URL + artwork.imagePath.slice(1)))
    }
    setFailure(null); setArtworks(null); setReady(false); setAttempt((value) => value + 1)
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
      loadArtworks(abort.signal), check('models/munal_gallery.glb'), check('textures/munal_room_lightmap.png'),
    ]).then(([data]) => { if (!abort.signal.aborted) setArtworks(data) })
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

  return <main className="gallery-app">
    <div className="gallery-canvas" aria-label="Sala virtual del MUNAL">
      {artworks && !failure && <SceneBoundary key={attempt} onError={onSceneError}>
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.65, 0], fov: 65, near: 0.05, far: 100 }}
          gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 1.1, outputColorSpace: SRGBColorSpace }}
          fallback={<p role="alert">WebGL no está disponible. Activa la aceleración gráfica.</p>}>
          <color attach="background" args={['#101a16']} />
          <Suspense fallback={null}>
            <GalleryScene artworks={artworks} audioConfig={audioConfig} onReady={onReady}
              onLockChange={setLocked} onAudioError={onAudioError} />
          </Suspense>
        </Canvas>
      </SceneBoundary>}
    </div>
    <CuratorOverlay ready={ready} locked={locked} failure={failure} notice={notice} muted={muted}
      onToggleSound={() => setMuted((value) => !value)}
      onDismissNotice={() => setNotice('')}
      onRetry={() => { void retry().catch(onSceneError) }} />
  </main>
}
