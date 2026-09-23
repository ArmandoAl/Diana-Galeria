import { Vector3 } from 'three'

/**
 * Dimensiones exactas de la arquitectura del Museo (MUNAL XIX).
 * Obtenidas de los planos paramétricos en scripts/create_daylight_gallery.py y create_exhibition_room.py.
 */
export const MUSEUM_ROOM_DIMENSIONS = {
  /** Ancho interior de la sala (eje X: de -4.0 a +4.0 m) */
  width: 8.0,
  /** Longitud interior de la sala (eje Z en Three.js: de -8.0 a +8.0 m) */
  length: 16.0,
  /** Altura libre interior hasta el techo (eje Y: de 0.0 a 5.5 m) */
  height: 5.5,
  /** Altura estándar del centro de las obras a la línea de los ojos */
  eyeHeight: 1.65,
  /** Altura del zócalo perimetral de madera en los muros */
  baseboardHeight: 0.60,
  /** Ancho del marco dorado en cada lado del lienzo */
  frameBorderWidth: 0.08,
  /** Suplemento total del marco al ancho y alto del cuadro */
  frameTotalExtra: 0.16,
  /** Margen mínimo de respiración entre el borde exterior del marco y cualquier obstáculo */
  minClearanceMargin: 0.22,
} as const

/**
 * Definición de un segmento o paño de pared disponible para colgar obras.
 */
export interface WallSegmentDefinition {
  slotIndex: number
  /** Nombre descriptivo del paño de pared */
  name: string
  /** Eje a lo largo del muro ('z' para muros largos, 'x' para mamparas) */
  axis: 'x' | 'z'
  /** Coordenada fija perpendicular a la pared */
  fixedCoord: number
  /** Obstáculo en el extremo inferior o izquierdo */
  boundaryMin: number
  boundaryMinName: string
  /** Obstáculo en el extremo superior o derecho */
  boundaryMax: number
  boundaryMaxName: string
  /** Ancho total disponible en este paño de pared (metros) */
  availableWidth: number
  /** Centro geométrico exacto entre ambos obstáculos */
  trueCenterCoord: number
  /** Margen de seguridad específico para este paño */
  margin: number
  /** Ancho máximo absoluto para el lienzo (sin marco) */
  maxCanvasWidth: number
  /** Alto máximo absoluto para el lienzo (sin marco) */
  maxCanvasHeight: number
}

/**
 * Catálogo geométrico de todos los paños de pared (slots 0 a 13).
 *
 * Muros largos (X = ±4.0):
 * - Ventanas en Z = ±6.40 m y Z = ±2.40 m. Cada repisa de ventana mide 1.35 m de ancho (extensión ±0.675 m).
 * - Mampara 1 toca el muro izquierdo (X = -4.0) en Z = +3.40 m (su zócalo llega a Z = +3.55 m).
 * - Mampara 2 toca el muro derecho (X = +4.0) en Z = -3.40 m (su zócalo llega a Z = -3.55 m).
 */
export const WALL_SEGMENTS: Record<number, WallSegmentDefinition> = {
  // --- SALA 1 Y SALA 2: Muros Largos Perimetrales (Slots 0 a 5) ---

  // Slot 0: Muro izquierdo, entre Mampara 1 y Ventana 0
  0: {
    slotIndex: 0,
    name: 'Muro Izquierdo Norte (entre Mampara 1 y Ventana 0)',
    axis: 'z',
    fixedCoord: -3.98,
    boundaryMin: 3.55,
    boundaryMinName: 'Zócalo de Mampara 1 (Z = 3.55 m)',
    boundaryMax: 5.725,
    boundaryMaxName: 'Repisa de Ventana 0 (Z = 5.725 m)',
    availableWidth: 2.175,
    trueCenterCoord: 4.6375,
    margin: 0.22,
    maxCanvasWidth: 1.55, // 2.175 - 2*0.22 - 0.16 = 1.575 m
    maxCanvasHeight: 1.50,
  },

  // Slot 1: Muro izquierdo central, entre Ventana 2 y Ventana 1
  1: {
    slotIndex: 1,
    name: 'Muro Izquierdo Central (entre Ventana 2 y Ventana 1)',
    axis: 'z',
    fixedCoord: -3.98,
    boundaryMin: -1.725,
    boundaryMinName: 'Repisa de Ventana 2 (Z = -1.725 m)',
    boundaryMax: 1.725,
    boundaryMaxName: 'Repisa de Ventana 1 (Z = 1.725 m)',
    availableWidth: 3.45,
    trueCenterCoord: 0.00,
    margin: 0.25,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },

  // Slot 2: Muro izquierdo sur, entre Ventana 3 y Ventana 2
  2: {
    slotIndex: 2,
    name: 'Muro Izquierdo Sur (entre Ventana 3 y Ventana 2)',
    axis: 'z',
    fixedCoord: -3.98,
    boundaryMin: -5.725,
    boundaryMinName: 'Repisa de Ventana 3 (Z = -5.725 m)',
    boundaryMax: -3.075,
    boundaryMaxName: 'Repisa de Ventana 2 (Z = -3.075 m)',
    availableWidth: 2.65,
    trueCenterCoord: -4.40,
    margin: 0.25,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },

  // Slot 3: Muro derecho norte, entre Ventana 1 y Ventana 0
  3: {
    slotIndex: 3,
    name: 'Muro Derecho Norte (entre Ventana 1 y Ventana 0)',
    axis: 'z',
    fixedCoord: 3.98,
    boundaryMin: 3.075,
    boundaryMinName: 'Repisa de Ventana 1 (Z = 3.075 m)',
    boundaryMax: 5.725,
    boundaryMaxName: 'Repisa de Ventana 0 (Z = 5.725 m)',
    availableWidth: 2.65,
    trueCenterCoord: 4.40,
    margin: 0.25,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },

  // Slot 4: Muro derecho central, entre Ventana 2 y Ventana 1
  4: {
    slotIndex: 4,
    name: 'Muro Derecho Central (entre Ventana 2 y Ventana 1)',
    axis: 'z',
    fixedCoord: 3.98,
    boundaryMin: -1.725,
    boundaryMinName: 'Repisa de Ventana 2 (Z = -1.725 m)',
    boundaryMax: 1.725,
    boundaryMaxName: 'Repisa de Ventana 1 (Z = 1.725 m)',
    availableWidth: 3.45,
    trueCenterCoord: 0.00,
    margin: 0.25,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },

  // Slot 5: Muro derecho sur, entre Ventana 3 y Mampara 2
  5: {
    slotIndex: 5,
    name: 'Muro Derecho Sur (entre Ventana 3 y Mampara 2)',
    axis: 'z',
    fixedCoord: 3.98,
    boundaryMin: -5.725,
    boundaryMinName: 'Repisa de Ventana 3 (Z = -5.725 m)',
    boundaryMax: -3.55,
    boundaryMaxName: 'Zócalo de Mampara 2 (Z = -3.55 m)',
    availableWidth: 2.175,
    trueCenterCoord: -4.6375,
    margin: 0.22,
    maxCanvasWidth: 1.55, // 2.175 - 2*0.22 - 0.16 = 1.575 m
    maxCanvasHeight: 1.50,
  },

  // --- MAMPARAS CENTRALES (Slots 6 a 13) ---
  // Mampara 1: X de -4.0 a +0.8 (longitud 4.8 m, Z = 3.54 / 3.26)
  6: {
    slotIndex: 6,
    name: 'Mampara 1 Cara Norte (lado muro X = -4.0)',
    axis: 'x',
    fixedCoord: 3.54,
    boundaryMin: -4.00,
    boundaryMinName: 'Muro Perimetral Izquierdo (X = -4.00 m)',
    boundaryMax: -1.60,
    boundaryMaxName: 'Punto medio de Mampara (X = -1.60 m)',
    availableWidth: 2.40,
    trueCenterCoord: -2.70,
    margin: 0.20,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },
  7: {
    slotIndex: 7,
    name: 'Mampara 1 Cara Norte (lado paso X = +0.8)',
    axis: 'x',
    fixedCoord: 3.54,
    boundaryMin: -1.60,
    boundaryMinName: 'Punto medio de Mampara (X = -1.60 m)',
    boundaryMax: 0.80,
    boundaryMaxName: 'Extremo libre de Mampara (X = +0.80 m)',
    availableWidth: 2.40,
    trueCenterCoord: -0.50,
    margin: 0.20,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },
  8: {
    slotIndex: 8,
    name: 'Mampara 1 Cara Sur (lado muro X = -4.0)',
    axis: 'x',
    fixedCoord: 3.26,
    boundaryMin: -4.00,
    boundaryMinName: 'Muro Perimetral Izquierdo (X = -4.00 m)',
    boundaryMax: -1.60,
    boundaryMaxName: 'Punto medio de Mampara (X = -1.60 m)',
    availableWidth: 2.40,
    trueCenterCoord: -2.70,
    margin: 0.20,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },
  9: {
    slotIndex: 9,
    name: 'Mampara 1 Cara Sur (lado paso X = +0.8)',
    axis: 'x',
    fixedCoord: 3.26,
    boundaryMin: -1.60,
    boundaryMinName: 'Punto medio de Mampara (X = -1.60 m)',
    boundaryMax: 0.80,
    boundaryMaxName: 'Extremo libre de Mampara (X = +0.80 m)',
    availableWidth: 2.40,
    trueCenterCoord: -0.50,
    margin: 0.20,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },

  // Mampara 2: X de -0.8 a +4.0 (longitud 4.8 m, Z = -3.26 / -3.54)
  10: {
    slotIndex: 10,
    name: 'Mampara 2 Cara Norte (lado paso X = -0.8)',
    axis: 'x',
    fixedCoord: -3.26,
    boundaryMin: -0.80,
    boundaryMinName: 'Extremo libre de Mampara (X = -0.80 m)',
    boundaryMax: 1.60,
    boundaryMaxName: 'Punto medio de Mampara (X = +1.60 m)',
    availableWidth: 2.40,
    trueCenterCoord: 0.50,
    margin: 0.20,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },
  11: {
    slotIndex: 11,
    name: 'Mampara 2 Cara Norte (lado muro X = +4.0)',
    axis: 'x',
    fixedCoord: -3.26,
    boundaryMin: 1.60,
    boundaryMinName: 'Punto medio de Mampara (X = +1.60 m)',
    boundaryMax: 4.00,
    boundaryMaxName: 'Muro Perimetral Derecho (X = +4.00 m)',
    availableWidth: 2.40,
    trueCenterCoord: 2.70,
    margin: 0.20,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },
  12: {
    slotIndex: 12,
    name: 'Mampara 2 Cara Sur (lado paso X = -0.8)',
    axis: 'x',
    fixedCoord: -3.54,
    boundaryMin: -0.80,
    boundaryMinName: 'Extremo libre de Mampara (X = -0.80 m)',
    boundaryMax: 1.60,
    boundaryMaxName: 'Punto medio de Mampara (X = +1.60 m)',
    availableWidth: 2.40,
    trueCenterCoord: 0.50,
    margin: 0.20,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },
  13: {
    slotIndex: 13,
    name: 'Mampara 2 Cara Sur (lado muro X = +4.0)',
    axis: 'x',
    fixedCoord: -3.54,
    boundaryMin: 1.60,
    boundaryMinName: 'Punto medio de Mampara (X = +1.60 m)',
    boundaryMax: 4.00,
    boundaryMaxName: 'Muro Perimetral Derecho (X = +4.00 m)',
    availableWidth: 2.40,
    trueCenterCoord: 2.70,
    margin: 0.20,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  },
}

export interface AdaptiveArtworkFit {
  /** Ancho calculado para el lienzo del cuadro (metros) */
  targetWidth: number
  /** Alto calculado para el lienzo del cuadro (metros) */
  targetHeight: number
  /** Nueva posición 3D centrada en el paño de pared */
  targetCenter: Vector3
  /** Factor de escala vectorial para la geometría */
  scale: Vector3
  /** Segmento de pared asignado */
  segment: WallSegmentDefinition
}

/**
 * Calcula las dimensiones y la posición 3D óptimas de una obra de arte para
 * que se adapte con total precisión al paño de pared disponible, evitando colisiones
 * con ventanas, zócalos, esquinas y mamparas.
 */
export function computeAdaptiveArtworkLayout(
  slotIndex: number,
  originalCenter: Vector3,
  originalSize: Vector3,
  aspect: number,
  defaultDisplayWidth: number,
  defaultDisplayHeight: number,
): AdaptiveArtworkFit {
  const segment = WALL_SEGMENTS[slotIndex] ?? {
    slotIndex,
    name: `Slot ${slotIndex}`,
    axis: 'z',
    fixedCoord: originalCenter.x,
    boundaryMin: -10,
    boundaryMinName: 'Límite genérico',
    boundaryMax: 10,
    boundaryMaxName: 'Límite genérico',
    availableWidth: 3.0,
    trueCenterCoord: originalCenter.z,
    margin: 0.25,
    maxCanvasWidth: 1.80,
    maxCanvasHeight: 1.50,
  }

  const maxWidth = segment.maxCanvasWidth
  const maxHeight = segment.maxCanvasHeight

  // Cálculo proporcional con aspect ratio estricto:
  let targetWidth: number
  let targetHeight: number

  if (aspect >= 1) {
    // Obra horizontal (apaisada) o cuadrada:
    targetWidth = Math.min(maxWidth, maxHeight * aspect)
    targetHeight = targetWidth / aspect
    if (targetHeight > maxHeight) {
      targetHeight = maxHeight
      targetWidth = targetHeight * aspect
    }
  } else {
    // Obra vertical (retrato):
    targetHeight = Math.min(maxHeight, maxWidth / aspect)
    targetWidth = targetHeight * aspect
    if (targetWidth > maxWidth) {
      targetWidth = maxWidth
      targetHeight = targetWidth / aspect
    }
  }

  // Factor de escala a aplicar a la geometría fuente (lienzo o marco):
  const scale = new Vector3(
    originalSize.x > originalSize.z ? targetWidth / defaultDisplayWidth : 1,
    targetHeight / defaultDisplayHeight,
    originalSize.z > originalSize.x ? targetWidth / defaultDisplayWidth : 1,
  )

  // Centro geométrico ajustado al paño de pared:
  const targetCenter = originalCenter.clone()
  if (segment.axis === 'z') {
    targetCenter.z = segment.trueCenterCoord
  } else if (segment.axis === 'x') {
    targetCenter.x = segment.trueCenterCoord
  }

  return {
    targetWidth,
    targetHeight,
    targetCenter,
    scale,
    segment,
  }
}
