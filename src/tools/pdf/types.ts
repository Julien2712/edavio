export type EditorTool =
  | 'select'
  | 'text'
  | 'edit-text'
  | 'draw'
  | 'highlight'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'redact'
  | 'image'
  | 'sign'

export type FontFamily = 'Helvetica' | 'TimesRoman' | 'Courier'

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
}

export interface PathAnnotation extends BaseAnnotation {
  type: 'draw' | 'highlight'
  points: Point[]
  color: string
  strokeWidth: number
  opacity: number
}

export interface ShapeAnnotation extends BaseAnnotation {
  type: 'rect' | 'ellipse' | 'redact'
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
  /** Intrinsic width at scale 1 (in PDF points) when unrotated by user */
  baseWidth: number
  /** Intrinsic height at scale 1 (in PDF points) when unrotated by user */
  baseHeight: number
}

export interface DetectedTextItem {
  id: string
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
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
  redactColor: string
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
