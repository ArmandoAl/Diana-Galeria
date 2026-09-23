import { useCallback, useEffect, useRef, useState } from 'react'
import { useGalleryStore } from '../../stores/useGalleryStore.ts'
import styles from './MobileControls.module.css'

const JOYSTICK_RADIUS = 46

export function MobileControls() {
  const nearArtwork = useGalleryStore((state) => state.isNearArtwork)
  const nearbyDoor = useGalleryStore((state) => state.nearbyDoor)
  const touchRunning = useGalleryStore((state) => state.touchRunning)
  const setTouchRunning = useGalleryStore((state) => state.setTouchRunning)
  const setTouchMove = useGalleryStore((state) => state.setTouchMove)
  const addTouchLookDelta = useGalleryStore((state) => state.addTouchLookDelta)
  const triggerInteraction = useGalleryStore((state) => state.triggerInteraction)

  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 })
  const [isJoystickActive, setIsJoystickActive] = useState(false)

  const joystickPointerId = useRef<number | null>(null)
  const joystickCenter = useRef({ x: 0, y: 0 })

  const lookPointerId = useRef<number | null>(null)
  const lookLastPos = useRef({ x: 0, y: 0 })

  // Limpiar estados de movimiento al desmontar
  useEffect(() => {
    return () => {
      setTouchMove({ x: 0, y: 0 })
    }
  }, [setTouchMove])

  // --- JOYSTICK LOGIC ---
  const handleJoystickPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    joystickPointerId.current = e.pointerId
    const rect = target.getBoundingClientRect()
    joystickCenter.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
    setIsJoystickActive(true)
  }, [])

  const handleJoystickPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== e.pointerId) return
    e.stopPropagation()

    const rawDx = e.clientX - joystickCenter.current.x
    const rawDy = e.clientY - joystickCenter.current.y
    const distance = Math.hypot(rawDx, rawDy)

    const angle = Math.atan2(rawDy, rawDx)
    const clampedDistance = Math.min(distance, JOYSTICK_RADIUS)

    const knobX = Math.cos(angle) * clampedDistance
    const knobY = Math.sin(angle) * clampedDistance

    setKnobPos({ x: knobX, y: knobY })

    // Normalizado entre -1 y 1
    const normalizedDistance = clampedDistance / JOYSTICK_RADIUS
    const moveX = Math.cos(angle) * normalizedDistance
    const moveY = Math.sin(angle) * normalizedDistance

    setTouchMove({ x: moveX, y: moveY })
  }, [setTouchMove])

  const handleJoystickPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== e.pointerId) return
    e.stopPropagation()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    joystickPointerId.current = null
    setIsJoystickActive(false)
    setKnobPos({ x: 0, y: 0 })
    setTouchMove({ x: 0, y: 0 })
  }, [setTouchMove])

  // --- TOUCH LOOK LOGIC (Arrastrar pantalla para mirar) ---
  const handleLookPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    lookPointerId.current = e.pointerId
    lookLastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleLookPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== e.pointerId) return

    const deltaX = e.clientX - lookLastPos.current.x
    const deltaY = e.clientY - lookLastPos.current.y
    lookLastPos.current = { x: e.clientX, y: e.clientY }

    addTouchLookDelta(deltaX, deltaY)
  }, [addTouchLookDelta])

  const handleLookPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== e.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    lookPointerId.current = null
  }, [])

  const showActionButton = nearArtwork || nearbyDoor !== null

  return (
    <div className={styles.mobileLayer} aria-label="Controles de navegación táctil">
      {/* Superficie transparente para rotar la cámara con el pulgar derecho */}
      <div
        className={styles.touchLookZone}
        onPointerDown={handleLookPointerDown}
        onPointerMove={handleLookPointerMove}
        onPointerUp={handleLookPointerEnd}
        onPointerCancel={handleLookPointerEnd}
        aria-hidden="true"
      />

      {/* Botón Central de Examinar Obra / Puerta: SOLO se renderiza cuando está activo */}
      {showActionButton && (
        <div className={styles.centerActionContainer}>
          <button
            type="button"
            className={styles.centerActionButton}
            onClick={triggerInteraction}
            aria-label={nearbyDoor ? 'Cruzar a la siguiente sala' : 'Examinar obra de arte'}
          >
            <span className={styles.actionIcon} aria-hidden="true">
              {nearbyDoor ? '🚪' : '👁️'}
            </span>
            <span className={styles.actionLabel}>
              {nearbyDoor
                ? nearbyDoor === 1
                  ? 'Siguiente sala'
                  : 'Sala anterior'
                : 'Examinar obra'}
            </span>
          </button>
        </div>
      )}

      <div className={styles.controlsContainer}>
        {/* Joystick virtual a la izquierda */}
        <div
          className={`${styles.joystickZone} ${isJoystickActive ? styles.joystickZoneActive : ''}`}
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={handleJoystickPointerEnd}
          onPointerCancel={handleJoystickPointerEnd}
          role="region"
          aria-label="Joystick de movimiento"
        >
          <div
            className={styles.joystickKnob}
            style={{
              transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
            }}
          >
            <div className={styles.joystickKnobInner} />
          </div>
        </div>

        {/* Botón de trote a la derecha */}
        <div className={styles.rightCluster}>
          <button
            type="button"
            className={`${styles.sprintButton} ${touchRunning ? styles.sprintButtonActive : ''}`}
            onClick={() => setTouchRunning(!touchRunning)}
            aria-pressed={touchRunning}
            aria-label={
              touchRunning
                ? 'Modo actual: Trotar. Toca para caminar'
                : 'Modo actual: Caminar. Toca para trotar'
            }
          >
            {touchRunning ? 'Trote' : 'Paso'}
          </button>
        </div>
      </div>
    </div>
  )
}
