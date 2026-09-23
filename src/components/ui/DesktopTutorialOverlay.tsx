import { useEffect } from 'react'
import styles from './DesktopTutorialOverlay.module.css'

interface DesktopTutorialOverlayProps {
  onClose: () => void
}

export function DesktopTutorialOverlay({ onClose }: DesktopTutorialOverlayProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return (
    <div
      className={styles.tutorialOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-tutorial-title"
      onClick={onClose}
    >
      <div
        className={styles.tutorialCard}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Cerrar tutorial y empezar recorrido"
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

        <header className={styles.header}>
          <span className={styles.eyebrow}>Guía de navegación para PC</span>
          <h2 id="desktop-tutorial-title" className={styles.title}>
            Controles de escritorio
          </h2>
        </header>

        <div className={styles.grid}>
          {/* Tarjeta 1: Caminar */}
          <div className={styles.controlCard}>
            <div className={styles.keyCluster}>
              <div className={styles.keyClusterRow}>
                <span className={styles.kbd}>W</span>
              </div>
              <div className={styles.keyClusterRow}>
                <span className={styles.kbd}>A</span>
                <span className={styles.kbd}>S</span>
                <span className={styles.kbd}>D</span>
              </div>
            </div>
            <p className={styles.cardTitle}>Caminar</p>
            <p className={styles.cardDesc}>
              Usa las teclas <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> para desplazarte. Mantén <kbd>Shift</kbd> para trotar.
            </p>
          </div>

          {/* Tarjeta 2: Mirar */}
          <div className={styles.controlCard}>
            <div className={styles.mouseIconWrap}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="2" width="14" height="20" rx="7" />
                <line x1="12" y1="6" x2="12" y2="10" />
              </svg>
            </div>
            <p className={styles.cardTitle}>Mirar alrededor</p>
            <p className={styles.cardDesc}>
              Mueve el ratón para rotar la cámara y observar la galería en 360 grados.
            </p>
          </div>

          {/* Tarjeta 3: Contemplar */}
          <div className={styles.controlCard}>
            <div className={styles.keyGroup}>
              <span className={styles.kbd}>E</span>
              <span style={{ fontSize: '0.8rem', color: '#d5b876' }}>o</span>
              <span className={styles.kbd}>Clic</span>
            </div>
            <p className={styles.cardTitle}>Examinar obras</p>
            <p className={styles.cardDesc}>
              Presiona <kbd>E</kbd> o haz clic frente a un cuadro o puerta para abrir la ficha o cruzar de sala.
            </p>
          </div>

          {/* Tarjeta 4: Sonido */}
          <div className={styles.controlCard}>
            <div className={styles.keyGroup}>
              <span className={styles.kbd}>M</span>
            </div>
            <p className={styles.cardTitle}>Silenciar / Sonido</p>
            <p className={styles.cardDesc}>
              Pulsa la tecla <kbd>M</kbd> en cualquier momento para activar o silenciar el audio al instante.
            </p>
          </div>
        </div>

        <div className={styles.shortcutBanner}>
          <div className={styles.shortcutRow}>
            <span className={styles.kbd}>Esc</span>
            <span><strong>Liberar cursor:</strong> Presiona <kbd>Esc</kbd> para salir del modo inmersivo y mover el cursor libremente por la pantalla.</span>
          </div>
          <div className={styles.shortcutRow}>
            <span className={styles.kbd}>M</span>
            <span><strong>Atajo de sonido:</strong> Alterna la música sin necesidad de salir del recorrido.</span>
          </div>
        </div>

        <button
          type="button"
          className={styles.startButton}
          onClick={onClose}
        >
          <span className={styles.enterKeyBadge}>Enter ↵</span>
          <span>Presiona Enter para empezar</span>
        </button>
      </div>
    </div>
  )
}
