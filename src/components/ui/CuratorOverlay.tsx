import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useGalleryStore } from '../../stores/useGalleryStore.ts'
import { MobileControls } from './MobileControls.tsx'
import { TouchTutorialOverlay } from './TouchTutorialOverlay.tsx'
import { DesktopTutorialOverlay } from './DesktopTutorialOverlay.tsx'
import type { ArtistProfile } from '../../types/artist.ts'
import styles from './CuratorOverlay.module.css'

export interface CuratorOverlayProps {
  artist?: ArtistProfile | null
  ready: boolean
  locked: boolean
  failure?: Error | null
  notice?: string
  muted: boolean
  onToggleSound: () => void
  onDismissNotice: () => void
  onRetry: () => void
  roomIndex?: number
  roomCount?: number
  roomName?: string
  phase?: 'idle' | 'out' | 'loading' | 'in'
}

export function CuratorOverlay({
  artist,
  ready,
  locked,
  failure,
  notice,
  muted,
  onToggleSound,
  onDismissNotice,
  onRetry,
  roomIndex = 0,
  roomCount = 1,
  roomName = '',
  phase = 'idle',
}: CuratorOverlayProps) {
  const artwork = useGalleryStore((state) => state.activeArtwork)
  const inspecting = useGalleryStore((state) => state.isInspecting)
  const housePhotosOpen = useGalleryStore((state) => state.isHousePhotosOpen)
  const isNearHouse = useGalleryStore((state) => state.isNearHouse)
  const isExploring = useGalleryStore((state) => state.isExploring)
  const near = useGalleryStore((state) => state.isNearArtwork) || isNearHouse
  const door = useGalleryStore((state) => state.nearbyDoor)
  const close = useGalleryStore((state) => state.closeArtworkModal)

  const [isTouch] = useState(() => {
    return (
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0)
    )
  })
  const [showTutorial, setShowTutorial] = useState(false)
  const [showDesktopTutorial, setShowDesktopTutorial] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const houseDialog = useRef<HTMLDialogElement>(null)
  const [housePhotoIndex, setHousePhotoIndex] = useState(0)
  const enter = useRef<HTMLButtonElement>(null)
  const special = artwork?.isSpecial === true
  const astillas = artist?.projectWorks.find((work) => work.title === 'Astillas en la piel')

  const { progress } = useProgress()
  const roundedProgress = Math.min(100, Math.round(progress))

  useEffect(() => {
    useGalleryStore.getState().setIsMobile(isTouch)
  }, [isTouch])

  useEffect(() => {
    const element = dialog.current
    if (artwork && inspecting && element && !element.open) element.showModal()
    return () => element?.close()
  }, [artwork, inspecting])

  useEffect(() => {
    const element = houseDialog.current
    if (housePhotosOpen && element && !element.open) element.showModal()
    return () => element?.close()
  }, [housePhotosOpen])

  const handleEnterClick = useCallback(() => {
    useGalleryStore.getState().setIsExploring(true)
    if (isTouch) {
      const hasSeen = localStorage.getItem('munal_touch_tutorial_seen')
      if (!hasSeen) {
        setShowTutorial(true)
        localStorage.setItem('munal_touch_tutorial_seen', 'true')
      }
    } else {
      const hasSeenDesktop = localStorage.getItem('munal_desktop_tutorial_seen')
      if (!hasSeenDesktop) {
        setShowDesktopTutorial(true)
        localStorage.setItem('munal_desktop_tutorial_seen', 'true')
      }
    }
  }, [isTouch])

  const handleCloseArtwork = useCallback(() => {
    dialog.current?.close()
    houseDialog.current?.close()
    close()
    if (!isTouch && useGalleryStore.getState().isExploring) {
      const canvasEl = document.querySelector('canvas')
      try {
        void canvasEl?.requestPointerLock().catch(() => {})
      } catch {
        // Fallback: el clic sobre el canvas vuelve a capturar el cursor.
      }
    }
  }, [close, isTouch])

  const isTourActive = locked || isExploring

  return (
    <div className={styles.overlay}>
      <header className={styles.header}>
        <div className={styles.brandBlock}>
          <span className={styles.eyebrow}>Museo virtual</span>
          <p className={styles.brand}>MUNAL</p>
          {!isTouch && (
            <span className={styles.desktopHint} title="Presiona M para sonido y Esc para liberar cursor">
              <kbd>M</kbd> sonido · <kbd>Esc</kbd> cursor
            </span>
          )}
        </div>

        {ready && (
          <div className={styles.roomBadge} role="status">
            <span>
              Sala {roomIndex + 1} de {roomCount}
            </span>
            <span className={styles.roomBadgeDot}>·</span>
            <span className={styles.roomBadgeName}>{roomName}</span>
          </div>
        )}

        <div className={styles.headerActions}>
          {isExploring && !inspecting && (
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => useGalleryStore.getState().setIsExploring(false)}
            >
              Menú
            </button>
          )}

          {/* Icon button para sonido */}
          <button
            type="button"
            className={`${styles.iconButton} ${muted ? styles.iconButtonMuted : styles.iconButtonActive}`}
            aria-pressed={muted}
            aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
            title={muted ? 'Activar sonido (tecla M)' : 'Silenciar sonido (tecla M)'}
            onClick={onToggleSound}
          >
            {muted ? (
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </svg>
            ) : (
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>

          {/* Icon button de ayuda para el tutorial (móvil y escritorio) */}
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => (isTouch ? setShowTutorial(true) : setShowDesktopTutorial(true))}
            aria-label={isTouch ? 'Ver guía de navegación táctil' : 'Ver controles de teclado y ratón'}
            title={isTouch ? 'Guía táctil' : 'Guía de controles (PC)'}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </div>
      </header>

      {/* Tutorial de 2 dedos en dispositivos táctiles */}
      {showTutorial && (
        <TouchTutorialOverlay onClose={() => setShowTutorial(false)} />
      )}

      {/* Tutorial de teclado y ratón en versión escritorio */}
      {showDesktopTutorial && (
        <DesktopTutorialOverlay onClose={() => setShowDesktopTutorial(false)} />
      )}

      {/* No desmontar: PointerLockControls registra su listener sobre #enter-gallery. */}
      <section
        className={styles.welcome}
        hidden={isTourActive || inspecting || phase !== 'idle'}
        aria-labelledby="welcome-title"
      >
        <img
          className={styles.welcomePortrait}
          src={`${import.meta.env.BASE_URL}author/author4.jpg`}
          alt="Diana Carranza Lucatero"
        />
        <div className={styles.welcomeCard}>
          <span className={styles.seal} aria-hidden="true">
            XIX
          </span>
          <p className={styles.eyebrow}>Una visita para recordar</p>
          <h1 id="welcome-title">
            <span className={styles.welcomeLead}>Bienvenida a la galería de</span>
            Diana Carranza Lucatero
          </h1>
          <p className={styles.invitation}>
            En sus obras, Diana explora la memoria, la herencia y el hogar como espacio emocional.
            Acércate a cada pieza y descubre las historias que guarda.
          </p>

          {/* Indicador de carga con barra de progreso interactiva */}
          {!ready && !failure && (
            <div className={styles.loadingContainer}>
              <div className={styles.progressBarWrapper}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${Math.max(10, roundedProgress)}%` }}
                />
              </div>
              <div className={styles.loadingInfo}>
                <span className={styles.loadingText}>
                  {roundedProgress > 0
                    ? `Cargando arquitectura y pinturas 3D... ${roundedProgress}%`
                    : 'Preparando la sala, la luz y sus obras…'}
                </span>
                <span className={styles.loadingPercent}>
                  {roundedProgress}%
                </span>
              </div>
            </div>
          )}

          {ready && !failure && (
            <p id="gallery-status" className={styles.readyStatus} role="status">
              ✓ Tu recorrido está listo. Ponte los auriculares y entra.
            </p>
          )}

          {failure && (
            <p id="gallery-status" className={styles.error} role="alert">
              {failure.message}
            </p>
          )}

          {failure && (
            <button
              type="button"
              className={styles.quietButton}
              onClick={onRetry}
            >
              Reintentar carga
            </button>
          )}

          <button
            ref={enter}
            id="enter-gallery"
            className={`${styles.goldButton} ${ready ? styles.goldButtonReady : styles.goldButtonLoading}`}
            type="button"
            onClick={handleEnterClick}
            disabled={!ready || !!failure}
            aria-describedby="gallery-status gallery-controls"
          >
            {!ready && !failure ? (
              <span className={styles.buttonSpinnerContent}>
                <span className={styles.spinner} aria-hidden="true" />
                <span>Preparando sala ({roundedProgress}%)...</span>
              </span>
            ) : (
              <span>Entrar al recorrido</span>
            )}
          </button>

          <p id="gallery-controls" className={styles.controls}>
            {isTouch ? (
              <>
                Usa 2 dedos: Joystick para caminar · Desliza para mirar
                <br />
                Acércate a un cuadro o puerta para que aparezca el botón de acción
              </>
            ) : (
              <>
                <kbd>WASD</kbd> caminar · Ratón para mirar · <kbd>Shift</kbd> trotar
                <br />
                <kbd>E</kbd> o clic para contemplar · <kbd>Esc</kbd> liberar el cursor
                <br />
                <kbd>E</kbd>, <kbd>F</kbd> o clic frente a una puerta para cambiar de sala
              </>
            )}
          </p>
          <p className={styles.caption}>
            {isTouch
              ? 'Optimizado para pantallas táctiles y dispositivos móviles.'
              : 'Experiencia para teclado y ratón. El clic captura el cursor y habilita el audio.'}
          </p>
        </div>
      </section>

      {/* Retícula central para apuntar */}
      {isTourActive && !inspecting && phase === 'idle' && (
        <div className={styles.aim}>
          <span
            className={`${styles.reticle} ${near || door ? styles.reticleActive : ''}`}
            aria-hidden="true"
          />
          {!isTouch && (
            <p className={styles.tooltip} role="status" aria-live="polite">
              {door ? (
                <><kbd>E</kbd> / <kbd>F</kbd> o clic · {door === 1 ? 'Siguiente sala' : 'Sala anterior'}</>
              ) : near ? (
                isNearHouse
                  ? <>Presiona <kbd>[E]</kbd> o haz clic para ver la casita</>
                  : <>Presiona <kbd>[E]</kbd> o haz clic para contemplar</>
              ) : null}
            </p>
          )}
        </div>
      )}

      {isTouch && isTourActive && !inspecting && phase === 'idle' && (
        <MobileControls />
      )}

      <div
        className={styles.roomTransition}
        data-phase={phase}
        aria-hidden={phase === 'idle'}
      >
        <p>
          {phase === 'loading'
            ? 'Preparando la siguiente sala…'
            : `Sala ${roomIndex + 1} · ${roomName}`}
        </p>
      </div>

      <dialog
        ref={dialog}
        className={`${styles.dialog} ${special ? styles.loveLetter : ''}`}
        aria-labelledby="artwork-title"
        onCancel={(event) => {
          event.preventDefault()
          handleCloseArtwork()
        }}
      >
        {artwork && (
          <article className={styles.artworkPanel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelBrand}>
                <span>MUNAL</span>
                <span className={styles.panelBrandDivider} aria-hidden="true" />
                <span>Gabinete del Siglo XIX</span>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Cerrar ficha y continuar el recorrido"
                title="Cerrar ficha"
                onClick={handleCloseArtwork}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className={styles.panelGrid}>
              <img
                className={styles.artwork}
                src={import.meta.env.BASE_URL + artwork.imagePath.slice(1)}
                alt={artwork.title}
              />
              <div className={styles.panelBody}>
                <p className={styles.eyebrow}>
                  {special ? 'Una carta, solo para ti' : 'Ficha de la colección'}
                </p>
                {special && (
                  <p className={styles.dedication}>
                    Entre todas las obras, esta es para ti.
                  </p>
                )}
                <h2 id="artwork-title">{artwork.title}</h2>
                <dl className={styles.metadata}>
                  <div>
                    <dt>Autora</dt>
                    <dd>{artwork.artist}</dd>
                  </div>
                  <div>
                    <dt>Año</dt>
                    <dd>{artwork.year}</dd>
                  </div>
                  <div>
                    <dt>Técnica</dt>
                    <dd>{artwork.technique}</dd>
                  </div>
                  <div>
                    <dt>Dimensiones</dt>
                    <dd>{artwork.dimensions}</dd>
                  </div>
                </dl>
                <p className={styles.description}>{artwork.description}</p>
                <footer className={styles.panelFooter}>
                  <span className={styles.caption}>
                    También puedes cerrar con <kbd>Esc</kbd>.
                  </span>
                  <button
                    type="button"
                    className={styles.goldButton}
                    onClick={handleCloseArtwork}
                  >
                    Continuar recorrido
                  </button>
                </footer>
              </div>
            </div>
          </article>
        )}
      </dialog>

      <dialog
        ref={houseDialog}
        className={styles.dialog}
        aria-labelledby="house-title"
        onCancel={(event) => {
          event.preventDefault()
          handleCloseArtwork()
        }}
      >
        {housePhotosOpen && (
          <article>
            <div className={styles.panelHeader}>
              <p className={styles.eyebrow}>Proyecto universitario · pieza de madera</p>
              <button type="button" className={styles.closeButton} aria-label="Cerrar fotografías y continuar el recorrido" onClick={handleCloseArtwork}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <h2 id="house-title">La madriguera</h2>
            <img
              className={styles.artwork}
              src={`${import.meta.env.BASE_URL}casita-galeria/${String(housePhotoIndex + 1).padStart(2, '0')}.jpg`}
              alt={`Fotografía ${housePhotoIndex + 1} de la casita pintada`}
            />
            {astillas && (
              <div className={styles.panelBody}>
                <h3>Astillas en la piel · 2025</h3>
                <dl className={styles.metadata}>
                  <div><dt>Autora</dt><dd>Diana Carranza Lucatero</dd></div>
                  <div><dt>Técnica</dt><dd>{astillas.technique}</dd></div>
                  <div><dt>Dimensiones</dt><dd>{astillas.dimensions}</dd></div>
                </dl>
                <p className={styles.description}>{astillas.description}</p>
              </div>
            )}
            <div className={styles.panelBody}>
              <footer className={styles.panelFooter}>
                <button type="button" className={styles.quietButton} onClick={() => setHousePhotoIndex((index) => (index + 5) % 6)}>
                  Foto anterior
                </button>
                <span className={styles.caption}>{housePhotoIndex + 1} / 6</span>
                <button type="button" className={styles.quietButton} onClick={() => setHousePhotoIndex((index) => (index + 1) % 6)}>
                  Siguiente foto
                </button>
              </footer>
              <footer className={styles.panelFooter}>
                <span className={styles.caption}>Fotografías originales de la pieza.</span>
                <button type="button" className={styles.goldButton} onClick={handleCloseArtwork}>Continuar recorrido</button>
              </footer>
            </div>
          </article>
        )}
      </dialog>

      {/* Avisos generales de error (excluyendo advertencias de sonido para respetar solicitud) */}
      {notice && !notice.toLowerCase().includes('sonido') && (
        <aside className={styles.notice} role="status">
          <span>{notice}</span>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Cerrar aviso"
            onClick={onDismissNotice}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </aside>
      )}
    </div>
  )
}
