import { POLYGONS } from '@/tools/pdf/shapeGeometry'

/** Slides are laid out in CSS pixels at 96 dpi (1280 x 720 = 13.333 x 7.5 in). Font sizes are in points. */
export const PX_PER_PT = 96 / 72
export const DEFAULT_W = 1280
export const DEFAULT_H = 720

export type Align = 'left' | 'center' | 'right' | 'justify'
export type VAlign = 'top' | 'middle' | 'bottom'
export type Bullet = 'none' | 'bullet' | 'number'

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  /** points */
  size?: number
  font?: string
  highlight?: string
}

export interface Para {
  runs: Run[]
  align?: Align
  bullet?: Bullet
  level?: number
  /** line spacing multiple (1 = single) */
  lineSpacing?: number
}

export type GeomKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'rtTriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star5'
  | 'star4'
  | 'plus'
  | 'rightArrow'
  | 'leftArrow'
  | 'upArrow'
  | 'downArrow'
  | 'chevron'
  | 'homePlate'
  | 'trapezoid'
  | 'parallelogram'
  | 'heart'
  | 'line'

export const GEOM_GROUPS: { id: string; items: GeomKind[] }[] = [
  { id: 'basic', items: ['rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'trapezoid', 'parallelogram', 'heart'] },
  { id: 'arrows', items: ['rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'chevron', 'homePlate'] },
  { id: 'stars', items: ['star5', 'star4', 'plus'] },
]

interface BaseEl {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** degrees, clockwise */
  rot: number
  flipH?: boolean
  flipV?: boolean
  /** Decoration coming from the slide layout / master: shown but not selectable */
  locked?: boolean
}

export interface ShapeEl extends BaseEl {
  kind: 'shape'
  geom: GeomKind
  fill: string | null
  fillAlpha?: number
  line: string | null
  /** points */
  lineW: number
  dash?: 'solid' | 'dash' | 'dot'
  arrowStart?: boolean
  arrowEnd?: boolean
  shadow?: boolean
  paras: Para[]
  valign: VAlign
  /** default text style when a run has no explicit value */
  base: { size: number; color: string; font: string }
  /** inner margin in px */
  pad: number
}

export interface ImageEl extends BaseEl {
  kind: 'image'
  src: string
  alpha?: number
}

export interface TableCell {
  text: string
  fill?: string
  color?: string
  bold?: boolean
  align?: Align
}

export interface TableEl extends BaseEl {
  kind: 'table'
  rows: TableCell[][]
  colW: number[]
  rowH: number
  fontSize: number
  font: string
  border: string
  header: boolean
}

export type SlideEl = ShapeEl | ImageEl | TableEl

export interface Slide {
  id: string
  bg: string
  bgImage?: string
  elements: SlideEl[]
}

export interface Deck {
  title: string
  w: number
  h: number
  slides: Slide[]
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export const DEFAULT_FONT = 'Calibri'
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 88, 96]

export const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#ffffff',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#991b1b', '#9a3412', '#854d0e', '#166534', '#155e75', '#1e40af', '#5b21b6', '#9d174d',
]

export interface Theme {
  id: string
  bg: string
  text: string
  accent: string
}

export const THEMES: Theme[] = [
  { id: 'light', bg: '#ffffff', text: '#1f2937', accent: '#4f46e5' },
  { id: 'night', bg: '#0f172a', text: '#f8fafc', accent: '#818cf8' },
  { id: 'indigo', bg: '#1e1b4b', text: '#eef2ff', accent: '#a5b4fc' },
  { id: 'forest', bg: '#052e16', text: '#ecfdf5', accent: '#34d399' },
  { id: 'cream', bg: '#fefce8', text: '#27272a', accent: '#d97706' },
  { id: 'rose', bg: '#fff1f2', text: '#4c0519', accent: '#e11d48' },
  { id: 'ocean', bg: '#ecfeff', text: '#083344', accent: '#0891b2' },
  { id: 'slate', bg: '#e2e8f0', text: '#0f172a', accent: '#334155' },
]

export function para(text: string, run: Partial<Run> = {}, p: Partial<Para> = {}): Para {
  return { runs: text ? [{ text, ...run }] : [], ...p }
}

export function newShape(partial: Partial<ShapeEl> & Pick<ShapeEl, 'x' | 'y' | 'w' | 'h'>): ShapeEl {
  return {
    id: uid(),
    kind: 'shape',
    geom: 'rect',
    rot: 0,
    fill: null,
    line: null,
    lineW: 1,
    paras: [],
    valign: 'top',
    base: { size: 18, color: '#1f2937', font: DEFAULT_FONT },
    pad: 10,
    ...partial,
  }
}

export function newTextBox(
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  o: { size?: number; bold?: boolean; color?: string; align?: Align; font?: string; valign?: VAlign } = {},
): ShapeEl {
  const size = o.size ?? 18
  const color = o.color ?? '#1f2937'
  const font = o.font ?? DEFAULT_FONT
  return newShape({
    x,
    y,
    w,
    h,
    valign: o.valign ?? 'top',
    base: { size, color, font },
    paras: text
      .split('\n')
      .map((line) => para(line, { size, color, font, bold: o.bold }, { align: o.align ?? 'left' })),
  })
}

export function newImage(src: string, x: number, y: number, w: number, h: number): ImageEl {
  return { id: uid(), kind: 'image', src, x, y, w, h, rot: 0 }
}

export function newTable(x: number, y: number, rows: number, cols: number, theme: Theme): TableEl {
  const colW = Array.from({ length: cols }, () => 150)
  return {
    id: uid(),
    kind: 'table',
    x,
    y,
    w: colW.reduce((a, b) => a + b, 0),
    h: rows * 44,
    rot: 0,
    rows: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, () =>
        r === 0 ? { text: '', fill: theme.accent, color: '#ffffff', bold: true } : { text: '' },
      ),
    ),
    colW,
    rowH: 44,
    fontSize: 16,
    font: DEFAULT_FONT,
    border: '#cbd5e1',
    header: true,
  }
}

// ── Slide layouts (like the "Mise en page" gallery of PowerPoint) ─────────────

export type LayoutId = 'title' | 'titleContent' | 'twoContent' | 'section' | 'titleOnly' | 'blank'
export const LAYOUT_IDS: LayoutId[] = ['title', 'titleContent', 'twoContent', 'section', 'titleOnly', 'blank']

export function layoutElements(id: LayoutId, theme: Theme, w: number, h: number, texts: Record<string, string>): SlideEl[] {
  const c = theme.text
  const m = Math.round(w * 0.06)
  switch (id) {
    case 'title':
      return [
        newTextBox(m, h * 0.3, w - 2 * m, h * 0.2, texts.title ?? '', { size: 54, bold: true, color: c, align: 'center', valign: 'middle' }),
        newTextBox(m * 2, h * 0.54, w - 4 * m, h * 0.12, texts.subtitle ?? '', { size: 26, color: theme.accent, align: 'center', valign: 'top' }),
      ]
    case 'titleContent':
      return [
        newTextBox(m, h * 0.07, w - 2 * m, h * 0.15, texts.heading ?? '', { size: 40, bold: true, color: c, valign: 'middle' }),
        bulletBox(newTextBox(m, h * 0.26, w - 2 * m, h * 0.62, texts.body ?? '', { size: 26, color: c })),
      ]
    case 'twoContent': {
      const colW = (w - 3 * m) / 2
      return [
        newTextBox(m, h * 0.07, w - 2 * m, h * 0.15, texts.heading ?? '', { size: 40, bold: true, color: c, valign: 'middle' }),
        bulletBox(newTextBox(m, h * 0.26, colW, h * 0.62, texts.body ?? '', { size: 24, color: c })),
        bulletBox(newTextBox(2 * m + colW, h * 0.26, colW, h * 0.62, texts.body ?? '', { size: 24, color: c })),
      ]
    }
    case 'section':
      return [
        newTextBox(m, h * 0.38, w - 2 * m, h * 0.2, texts.heading ?? '', { size: 48, bold: true, color: c, valign: 'middle' }),
        newShape({ x: m + 10, y: h * 0.6, w: 160, h: 6, fill: theme.accent }),
      ]
    case 'titleOnly':
      return [newTextBox(m, h * 0.07, w - 2 * m, h * 0.15, texts.heading ?? '', { size: 40, bold: true, color: c, valign: 'middle' })]
    default:
      return []
  }
}

function bulletBox(el: ShapeEl): ShapeEl {
  return { ...el, paras: el.paras.map((p) => ({ ...p, bullet: 'bullet' as Bullet })) }
}

// ── Shape geometry ────────────────────────────────────────────────────────────

type Pt = readonly [number, number]

const ARROW_RIGHT: Pt[] = [[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]]

const POLY: Partial<Record<GeomKind, Pt[]>> = {
  triangle: POLYGONS.triangle,
  rtTriangle: POLYGONS['right-triangle'],
  diamond: POLYGONS.diamond,
  pentagon: POLYGONS.pentagon,
  hexagon: POLYGONS.hexagon,
  octagon: POLYGONS.octagon,
  star5: POLYGONS.star,
  star4: POLYGONS.star4,
  plus: POLYGONS.cross,
  rightArrow: ARROW_RIGHT,
  leftArrow: ARROW_RIGHT.map(([x, y]) => [1 - x, y] as Pt),
  upArrow: ARROW_RIGHT.map(([x, y]) => [y, 1 - x] as Pt),
  downArrow: ARROW_RIGHT.map(([x, y]) => [y, x] as Pt),
  chevron: POLYGONS.chevron,
  homePlate: [[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1]],
  trapezoid: POLYGONS.trapezoid,
  parallelogram: POLYGONS.parallelogram,
}

/** SVG path (in a w x h box) of a predefined shape, or null for line / plain shapes handled elsewhere. */
export function geomPath(geom: GeomKind, w: number, h: number): string | null {
  const poly = POLY[geom]
  if (poly) return poly.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * w).toFixed(2)},${(y * h).toFixed(2)}`).join(' ') + ' Z'
  if (geom === 'heart') {
    const k = (x: number, y: number) => `${(x * w).toFixed(2)},${(y * h).toFixed(2)}`
    return `M${k(0.5, 0.95)} C${k(0.1, 0.62)} ${k(-0.05, 0.3)} ${k(0.2, 0.12)} C${k(0.35, 0.02)} ${k(0.5, 0.1)} ${k(0.5, 0.25)} C${k(0.5, 0.1)} ${k(0.65, 0.02)} ${k(0.8, 0.12)} C${k(1.05, 0.3)} ${k(0.9, 0.62)} ${k(0.5, 0.95)} Z`
  }
  return null
}

export function polygonOf(geom: GeomKind): Pt[] | null {
  return POLY[geom] ?? null
}

/** Natural default colours for a freshly inserted shape */
export function defaultShapeStyle(theme: Theme) {
  return { fill: theme.accent, line: null as string | null, lineW: 1 }
}

export function cloneEl<T extends SlideEl>(el: T, dx = 0, dy = 0): T {
  return { ...el, id: uid(), x: el.x + dx, y: el.y + dy, locked: false } as T
}

export function boundsOf(els: SlideEl[]) {
  const x0 = Math.min(...els.map((e) => e.x))
  const y0 = Math.min(...els.map((e) => e.y))
  const x1 = Math.max(...els.map((e) => e.x + e.w))
  const y1 = Math.max(...els.map((e) => e.y + e.h))
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
}
