export type HAlign = 'general' | 'left' | 'center' | 'right'
export type VAlign = 'top' | 'middle' | 'bottom'
export type BorderStyle = 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double'

export interface Border {
  style: BorderStyle
  color: string
}

export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  font?: string
  /** points */
  size?: number
  color?: string
  bg?: string
  h?: HAlign
  v?: VAlign
  wrap?: boolean
  /** Excel number format code */
  fmt?: string
  indent?: number
  bt?: Border
  br?: Border
  bb?: Border
  bl?: Border
}

export interface Cell {
  /** Raw input: text, number or a formula starting with "=" */
  v: string
  s?: CellStyle
}

export interface Range {
  r1: number
  c1: number
  r2: number
  c2: number
}

export type RuleType = 'gt' | 'lt' | 'eq' | 'neq' | 'between' | 'contains' | 'blank' | 'dup' | 'scale' | 'bar'

export interface CondRule {
  id: string
  range: Range
  type: RuleType
  a?: string
  b?: string
  bg?: string
  color?: string
  bold?: boolean
}

export interface Sheet {
  id: string
  name: string
  rows: number
  cols: number
  /** keyed "r,c" (0-indexed) */
  cells: Record<string, Cell>
  colW: Record<number, number>
  rowH: Record<number, number>
  merges: Range[]
  freezeR: number
  freezeC: number
  rules: CondRule[]
  hiddenRows: number[]
  hiddenCols: number[]
  /** AutoFilter: column -> allowed values (display strings); undefined = filter off */
  filter?: { range: Range; allowed: Record<number, string[]> }
  showGrid: boolean
  tabColor?: string
}

export interface Workbook {
  title: string
  sheets: Sheet[]
}

export const DEFAULT_COL_W = 96
export const DEFAULT_ROW_H = 24
export const ROW_HEADER_W = 48
export const COL_HEADER_H = 24
export const MIN_COL_W = 20
export const MIN_ROW_H = 12

export const uid = () => Math.random().toString(36).slice(2, 10)
export const key = (r: number, c: number) => `${r},${c}`

export function colName(col: number): string {
  let s = ''
  let n = col
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

export function colIndex(letters: string): number {
  let col = 0
  for (const ch of letters.toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  return col - 1
}

export const cellRef = (r: number, c: number) => `${colName(c)}${r + 1}`

export function parseRef(ref: string): { r: number; c: number } | null {
  const m = ref.trim().replace(/\$/g, '').match(/^([A-Za-z]{1,3})(\d+)$/)
  if (!m) return null
  return { r: parseInt(m[2]!, 10) - 1, c: colIndex(m[1]!) }
}

export function newSheet(name: string, rows = 100, cols = 26): Sheet {
  return { id: uid(), name, rows, cols, cells: {}, colW: {}, rowH: {}, merges: [], freezeR: 0, freezeC: 0, rules: [], hiddenRows: [], hiddenCols: [], showGrid: true }
}

export const normRange = (r: Range): Range => ({ r1: Math.min(r.r1, r.r2), c1: Math.min(r.c1, r.c2), r2: Math.max(r.r1, r.r2), c2: Math.max(r.c1, r.c2) })
export const inRange = (r: Range, row: number, col: number) => row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2
export const rangeLabel = (r: Range) => (r.r1 === r.r2 && r.c1 === r.c2 ? cellRef(r.r1, r.c1) : `${cellRef(r.r1, r.c1)}:${cellRef(r.r2, r.c2)}`)

export const colWidth = (s: Sheet, c: number) => (s.hiddenCols.includes(c) ? 0 : s.colW[c] ?? DEFAULT_COL_W)
export const rowHeight = (s: Sheet, r: number) => (s.hiddenRows.includes(r) ? 0 : s.rowH[r] ?? DEFAULT_ROW_H)

/** merge containing a cell, if any */
export function mergeAt(s: Sheet, r: number, c: number): Range | undefined {
  return s.merges.find((m) => inRange(m, r, c))
}

export const FONTS_BASE = ['Calibri', 'Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Consolas']
export const DEFAULT_FONT = 'Calibri'
export const DEFAULT_SIZE = 11
