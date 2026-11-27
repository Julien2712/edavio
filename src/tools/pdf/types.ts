export type EditorTool =
  | 'select'
  | 'text'
  | 'edit-text'
  | 'edit-shape'
  | 'draw'
  | 'highlight'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'line'
  | 'arrow'
  | 'redact'
  | 'image'
  | 'sign'

import type { PolygonKind } from './shapeGeometry'

/** The 3 built-in PDF fonts, or the name of any font installed on the computer. */
export type FontFamily = 'Helvetica' | 'TimesRoman' | 'Courier' | (string & {})

export interface Point {
  x: number
  y: number
}

interface BaseAnnotation {
  id: string
  pageId: string
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text'
  x: number
  y: number
  width: number
  height: number
  text: string
  fontSize: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  color: string
  backgroundColor: string | null
  /** Text taken from an existing PDF line: single line, no wrapping, tight line box */
  compact?: boolean
  /** Extra spacing between characters (px at scale 1) used to match the original line width */
  letterSpacing?: number
  suppressionId?: string
}

export interface PathAnnotation extends BaseAnnotation {
  type: 'draw' | 'highlight'
  points: Point[]
  color: string
  strokeWidth: number
  opacity: number
}

export interface ShapeAnnotation extends BaseAnnotation {
  type: 'rect' | 'ellipse' | 'redact' | 'polygon'
  /** Which predefined shape, when type is 'polygon' */
  polygon?: PolygonKind
  /**
   * The fill is painted underneath the page content (multiply blend), like the background
   * of a frame in the original PDF: the text inside the shape stays visible.
   */
  underlay?: boolean
  x: number
  y: number
  width: number
  height: number
  color: string
  fillColor: string | null
  strokeWidth: number
  opacity: number
}

export interface LineAnnotation extends BaseAnnotation {
  type: 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  strokeWidth: number
}

export interface ImageAnnotation extends BaseAnnotation {
  type: 'image' | 'sign'
  x: number
  y: number
  width: number
  height: number
  dataUrl: string
  aspectRatio: number
}

export type Annotation =
  | TextAnnotation
  | PathAnnotation
  | ShapeAnnotation
  | LineAnnotation
  | ImageAnnotation

export interface PageEntry {
  id: string
  /** 0-based index in the source PDF, or null for newly added blank pages */
  originalIndex: number | null
  /** Additional user rotation in degrees (0, 90, 180, 270) */
  userRotation: 0 | 90 | 180 | 270
  /** Page flipped left/right (mirror), applied to content and annotations */
  mirrored?: boolean
  /** Intrinsic width at scale 1 (in PDF points) when unrotated by user */
  baseWidth: number
  /** Intrinsic height at scale 1 (in PDF points) when unrotated by user */
  baseHeight: number
}

export interface DetectedTextItem {
  id: string
  text: string
  /** Left edge of the run, viewport px at scale 1 */
  x: number
  /** Top of the clickable box, viewport px at scale 1 */
  y: number
  width: number
  height: number
  /** Exact font size (PDF points == px at scale 1), not rounded */
  fontSize: number
  fontFamily: FontFamily
  /** Baseline position, viewport px at scale 1 */
  baselineY: number
  /** pdf.js internal font id, used to avoid merging runs of different fonts */
  fontName: string
  bold: boolean
  italic: boolean
  /** true when bold/italic/family come from the real font name (not a guess) */
  fontKnown: boolean
  pdfX: number
  pdfMaxX: number
  pdfY: number
  pdfFontSize: number
}

export interface ToolStyleConfig {
  color: string
  fillColor: string | null
  textBgColor: string | null
  fontSize: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  strokeWidth: number
  highlightColor: string
  /** Shape currently picked in the shapes menu */
  polygonKind: PolygonKind
  redactColor: string
}

/** Axis-aligned box in raw PDF user space (y axis points up) */
export interface PdfBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A vector shape (rectangle, line, path) that already exists inside the PDF */
export interface PdfShape {
  id: string
  kind: 'rect' | 'line' | 'path' | 'image'
  paint: 'stroke' | 'fill' | 'both'
  /** Geometric bounding box (without stroke thickness) */
  box: PdfBox
  /** Endpoints [x1, y1, x2, y2] for kind 'line' */
  line?: [number, number, number, number]
  strokeColor: string | null
  fillColor: string | null
  /** Stroke thickness in PDF points */
  strokeWidth: number
  /**
   * Boxes of every raw drawing operation that makes up this shape. A frame drawn as
   * four separate lines plus a background is reported as one rectangle with 5 members.
   */
  members?: PdfBox[]
  /** kind 'line' only: the line ends with an arrow head at its second point */
  arrow?: boolean
}

export interface ShapeSuppression {
  kind: 'shape'
  id: string
  originalPageIndex: number
  /** Raw drawing operations to remove (matched by bounding box) */
  boxes: PdfBox[]
}

export const COLOR_SWATCHES = [
  '#0f172a',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#10b981',
  '#2563eb',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
] as const

export const HIGHLIGHT_SWATCHES = [
  '#fef08a',
  '#bbf7d0',
  '#bae6fd',
  '#fbcfe8',
  '#fed7aa',
] as const
