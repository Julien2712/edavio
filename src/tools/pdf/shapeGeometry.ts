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
  | 'round-rect'
  | 'pill'
  | 'semicircle'
  | 'quarter-circle'
  | 'heart'
  | 'moon'
  | 'cloud'
  | 'lightning'
  | 'checkmark'
  | 'x-mark'
  | 'speech'
  | 'star6'
  | 'star8'
  | 'heptagon'
  | 'decagon'
  | 'arrow-left'
  | 'arrow-up'
  | 'arrow-down'
  | 'double-arrow'
  | 'home-plate'
  | 'banner'

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

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const
  })
}

function roundRect(r: number): Pt[] {
  const P = Math.PI
  return [...arc(1 - r, r, r, r, -P / 2, 0, 6), ...arc(1 - r, 1 - r, r, r, 0, P / 2, 6), ...arc(r, 1 - r, r, r, P / 2, P, 6), ...arc(r, r, r, r, P, 1.5 * P, 6)]
}

const heart: Pt[] = Array.from({ length: 48 }, (_, i) => {
  const t = (i / 48) * Math.PI * 2
  const x = 16 * Math.sin(t) ** 3
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
  return [0.5 + x / 34, 0.46 - y / 34] as const
})

const cloud: Pt[] = (() => {
  const bumps: [number, number, number][] = [[0.28, 0.62, 0.2], [0.42, 0.4, 0.22], [0.64, 0.38, 0.22], [0.78, 0.6, 0.2], [0.55, 0.72, 0.2]]
  const pts: Pt[] = []
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2
    let best = 0
    for (const [cx, cy, r] of bumps) {
      // farthest point of this bump along the direction a from the cloud centre (0.53, 0.56)
      const dx = cx - 0.53, dy = cy - 0.56
      const proj = dx * Math.cos(a) + dy * Math.sin(a)
      const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a))
      if (perp < r) best = Math.max(best, proj + Math.sqrt(r * r - perp * perp))
    }
    pts.push([Math.min(1, Math.max(0, 0.53 + best * Math.cos(a))), Math.min(1, Math.max(0, 0.56 + best * Math.sin(a)))] as const)
  }
  return pts
})()

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
  'round-rect': roundRect(0.18),
  pill: roundRect(0.5),
  semicircle: arc(0.5, 1, 0.5, 1, Math.PI, 2 * Math.PI, 24),
  'quarter-circle': [[0, 1], ...arc(0, 1, 1, 1, -Math.PI / 2, 0, 18)],
  heart,
  moon: [...arc(0.55, 0.5, 0.45, 0.5, -Math.PI / 2, -1.5 * Math.PI, 20), ...arc(0.55, 0.5, 0.3, 0.5, Math.PI / 2, 1.5 * Math.PI, 20)],
  cloud,
  lightning: [[0.55, 0], [0.15, 0.55], [0.45, 0.55], [0.35, 1], [0.85, 0.4], [0.55, 0.4], [0.75, 0]],
  checkmark: [[0.05, 0.55], [0.2, 0.4], [0.4, 0.62], [0.82, 0.1], [0.97, 0.25], [0.4, 0.92]],
  'x-mark': [[0.15, 0], [0.5, 0.35], [0.85, 0], [1, 0.15], [0.65, 0.5], [1, 0.85], [0.85, 1], [0.5, 0.65], [0.15, 1], [0, 0.85], [0.35, 0.5], [0, 0.15]],
  speech: [[0.05, 0.05], [0.95, 0.05], [0.95, 0.7], [0.45, 0.7], [0.2, 0.95], [0.25, 0.7], [0.05, 0.7]],
  star6: star(6, 0.55),
  star8: star(8, 0.6),
  heptagon: regular(7),
  decagon: regular(10),
  'arrow-left': [[1, 0.3], [0.4, 0.3], [0.4, 0], [0, 0.5], [0.4, 1], [0.4, 0.7], [1, 0.7]],
  'arrow-up': [[0.3, 1], [0.3, 0.4], [0, 0.4], [0.5, 0], [1, 0.4], [0.7, 0.4], [0.7, 1]],
  'arrow-down': [[0.3, 0], [0.7, 0], [0.7, 0.6], [1, 0.6], [0.5, 1], [0, 0.6], [0.3, 0.6]],
  'double-arrow': [[0, 0.5], [0.22, 0.1], [0.22, 0.3], [0.78, 0.3], [0.78, 0.1], [1, 0.5], [0.78, 0.9], [0.78, 0.7], [0.22, 0.7], [0.22, 0.9]],
  'home-plate': [[0, 0.1], [0.7, 0.1], [1, 0.5], [0.7, 0.9], [0, 0.9]],
  banner: [[0, 0.15], [0.12, 0.15], [0.12, 0], [0.88, 0], [0.88, 0.15], [1, 0.15], [0.9, 0.5], [1, 0.85], [0.88, 0.85], [0.88, 1], [0.12, 1], [0.12, 0.85], [0, 0.85], [0.1, 0.5]],
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
