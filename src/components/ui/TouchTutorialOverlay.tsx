import { useEffect } from 'react'
import styles from './TouchTutorialOverlay.module.css'

interface TouchTutorialOverlayProps {
  onClose: () => void
}

export function TouchTutorialOverlay({ onClose }: TouchTutorialOverlayProps) {
  // Permitir cerrar con tecla Escape si un teclado está conectado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className={styles.tutorialOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
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
          <span className={styles.eyebrow}>Guía de navegación táctil</span>
          <h2 id="tutorial-title" className={styles.title}>
            Control con dos dedos
          </h2>
        </header>

        <div className={styles.columns}>
          {/* Columna Izquierda: Pulgar Izquierdo (Moverse) */}
          <div className={styles.columnCard}>
            <div className={styles.gestureVisual}>
              <div className={styles.joystickKnobAnimation} />
            </div>
            <p className={styles.handLabel}>Pulgar izquierdo</p>
            <p className={styles.handSub}>Moverse</p>
            <p className={styles.handDesc}>
              Arrastra el joystick inferior para caminar por la sala en cualquier dirección.
            </p>
          </div>

          {/* Columna Derecha: Pulgar Derecho (Mirar) */}
          <div className={styles.columnCard}>
            <div className={styles.gestureVisual}>
              <div className={styles.swipeTrail} />
              <div className={styles.swipeAnimation} />
            </div>
            <p className={styles.handLabel}>Pulgar derecho</p>
            <p className={styles.handSub}>Mirar alrededor</p>
            <p className={styles.handDesc}>
              Desliza en la pantalla para rotar la cámara y contemplar la arquitectura y obras.
            </p>
          </div>
        </div>

        <div className={styles.proTip}>
          <span>💡</span>
          <span>
            <strong>Consejo:</strong> Usa ambos pulgares a la vez para caminar mientras diriges la mirada hacia las pinturas.
          </span>
        </div>

        <button
          type="button"
          className={styles.startButton}
          onClick={onClose}
        >
          ¡Entendido! Comenzar recorrido
        </button>
      </div>
    </div>
  )
}
