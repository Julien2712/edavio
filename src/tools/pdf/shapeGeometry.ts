/** Predefined polygon shapes, described as points in the unit square (0..1). */
export type PolygonKind =
  | 'triangle'
  | 'right-triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'star4'
  | 'cross'
  | 'block-arrow'
  | 'chevron'
  | 'trapezoid'
  | 'parallelogram'

type Pt = readonly [number, number]

function regular(n: number, rot = -Math.PI / 2): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n
    return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)] as const
  })
}

function star(points: number, inner: number): Pt[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / points
    const r = i % 2 === 0 ? 0.5 : 0.5 * inner
    return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)] as const
  })
}

export const POLYGONS: Record<PolygonKind, Pt[]> = {
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  'right-triangle': [[0, 0], [1, 1], [0, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  pentagon: regular(5).map(([x, y]) => [x, y * 0.95 + 0.05] as const),
  hexagon: regular(6, 0),
  octagon: regular(8, Math.PI / 8),
  star: star(5, 0.4),
  star4: star(4, 0.35),
  cross: [
    [0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65],
    [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35],
  ],
  'block-arrow': [
    [0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7],
  ],
  chevron: [[0, 0], [0.65, 0], [1, 0.5], [0.65, 1], [0, 1], [0.35, 0.5]],
  trapezoid: [[0.2, 0], [0.8, 0], [1, 1], [0, 1]],
  parallelogram: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]],
}

export const POLYGON_KINDS = Object.keys(POLYGONS) as PolygonKind[]

/** Points of a polygon mapped to a box. */
export function polygonPoints(
  kind: PolygonKind,
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] {
  return (POLYGONS[kind] ?? POLYGONS.triangle).map(([px, py]) => [x + px * w, y + py * h])
}
