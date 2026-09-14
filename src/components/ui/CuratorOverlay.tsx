import { useEffect, useRef } from 'react'
import { useGalleryStore } from '../../stores/useGalleryStore.ts'
import styles from './CuratorOverlay.module.css'

export interface CuratorOverlayProps {
  ready: boolean
  locked: boolean
  failure?: Error | null
  notice?: string
  muted: boolean
  onToggleSound: () => void
  onDismissNotice: () => void
  onRetry: () => void
}

export function CuratorOverlay({ ready, locked, failure, notice, muted,
  onToggleSound, onDismissNotice, onRetry }: CuratorOverlayProps) {
  const artwork = useGalleryStore((state) => state.activeArtwork)
  const inspecting = useGalleryStore((state) => state.isInspecting)
  const near = useGalleryStore((state) => state.isNearArtwork)
  const close = useGalleryStore((state) => state.closeArtworkModal)
  const dialog = useRef<HTMLDialogElement>(null)
  const enter = useRef<HTMLButtonElement>(null)
  const special = artwork?.isSpecial === true

  useEffect(() => {
    const element = dialog.current
    if (artwork && inspecting && element && !element.open) element.showModal()
    return () => element?.close()
  }, [artwork, inspecting])

  return <div className={styles.overlay}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>Museo virtual</span><p className={styles.brand}>MUNAL</p></div>
      <button type="button" className={styles.quietButton} aria-pressed={muted}
        onClick={onToggleSound}>{muted ? 'Activar sonido' : 'Silenciar'}</button>
    </header>

    {/* No desmontar: PointerLockControls registra su listener sobre #enter-gallery. */}
    <section className={styles.welcome} hidden={locked || inspecting} aria-labelledby="welcome-title">
      <div className={styles.welcomeCard}>
        <span className={styles.seal} aria-hidden="true">XIX</span>
        <p className={styles.eyebrow}>Una visita para recordar</p>
        <h1 id="welcome-title">Gabinete del Siglo XIX — MUNAL</h1>
        <p className={styles.invitation}>El arte merece una pausa.<br />Entra, acércate y descubre lo que cada obra guarda para ti.</p>
        <p id="gallery-status" className={failure ? styles.error : styles.status}
          role={failure ? 'alert' : 'status'}>
          {failure ? failure.message : ready ? 'Tu recorrido está listo. Ponte los auriculares y entra.' : 'Preparando la sala, la luz y sus obras…'}
        </p>
        {failure && <button type="button" className={styles.quietButton} onClick={onRetry}>Reintentar carga</button>}
        <button ref={enter} id="enter-gallery" className={styles.goldButton} type="button"
          disabled={!ready || !!failure} aria-describedby="gallery-status gallery-controls">Entrar / continuar</button>
        <p id="gallery-controls" className={styles.controls}>
          <kbd>WASD</kbd> caminar · Ratón para mirar · <kbd>Shift</kbd> trotar<br />
          <kbd>E</kbd> o clic para contemplar · <kbd>Esc</kbd> liberar el cursor
        </p>
        <p className={styles.caption}>Experiencia para teclado y ratón. El clic captura el cursor y habilita el audio.</p>
      </div>
    </section>

    {locked && !inspecting && <div className={styles.aim}>
      <span className={`${styles.reticle} ${near ? styles.reticleActive : ''}`} aria-hidden="true" />
      <p className={styles.tooltip} role="status" aria-live="polite">
        {near && <>Presiona <kbd>[E]</kbd> o haz clic para contemplar</>}
      </p>
    </div>}

    <dialog ref={dialog} className={`${styles.dialog} ${special ? styles.loveLetter : ''}`}
      aria-labelledby="artwork-title" onCancel={close} onClose={() => {
        // Ignorar eventos close antiguos si StrictMode o una nueva ficha reabrieron el dialog.
        if (dialog.current?.open) return
        close()
        enter.current?.focus({ preventScroll: true })
      }}>
      {artwork && <article>
        <div className={styles.panelHeader}>
          <p className={styles.eyebrow}>{special ? 'Una carta, solo para ti' : 'Ficha de la colección'}</p>
          <button type="button" className={styles.closeButton} aria-label="Cerrar ficha" onClick={close}>×</button>
        </div>
        <img className={styles.artwork} src={import.meta.env.BASE_URL + artwork.imagePath.slice(1)} alt={artwork.title} />
        <div className={styles.panelBody}>
          {special && <p className={styles.dedication}>Entre todas las obras, esta es para ti.</p>}
          <h2 id="artwork-title">{artwork.title}</h2>
          <dl className={styles.metadata}>
            <div><dt>Autor</dt><dd>{artwork.artist}</dd></div>
            <div><dt>Año</dt><dd>{artwork.year}</dd></div>
            <div><dt>Técnica</dt><dd>{artwork.technique}</dd></div>
            <div><dt>Dimensiones</dt><dd>{artwork.dimensions}</dd></div>
          </dl>
          <p className={styles.description}>{artwork.description}</p>
          <footer className={styles.panelFooter}>
            <span className={styles.caption}>También puedes cerrar con <kbd>Esc</kbd>.</span>
            <button type="button" className={styles.goldButton} onClick={close}>Continuar recorrido</button>
          </footer>
        </div>
      </article>}
    </dialog>

    {notice && <aside className={styles.notice} role="status">
      <span>{notice}</span><button type="button" className={styles.closeButton}
        aria-label="Cerrar aviso" onClick={onDismissNotice}>×</button>
    </aside>}
  </div>
}
