import { adjustFormula, shiftFormula, FErr, type V } from './formula'
import { formatValue, parseTyped } from './format'
import { key, normRange, inRange, mergeAt, type Border, type Cell, type CellStyle, type CondRule, type Range, type Sheet, type Workbook } from './model'

export interface Pos { r: number; c: number }
export interface Sel { anchor: Pos; focus: Pos; extra: Range[] }

export const selRange = (s: Sel): Range => normRange({ r1: s.anchor.r, c1: s.anchor.c, r2: s.focus.r, c2: s.focus.c })
export const allRanges = (s: Sel): Range[] => [selRange(s), ...s.extra]
export const single = (r: number, c: number): Sel => ({ anchor: { r, c }, focus: { r, c }, extra: [] })
export const sameRange = (a: Range, b: Range) => a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2

export function updateSheet(wb: Workbook, si: number, fn: (s: Sheet) => Sheet): Workbook {
  const cur = wb.sheets[si]
  if (!cur) return wb
  const next = fn(cur)
  return next === cur ? wb : { ...wb, sheets: wb.sheets.map((s, i) => (i === si ? next : s)) }
}

export function forEachCell(ranges: Range[], fn: (r: number, c: number) => void) {
  const seen = new Set<string>()
  for (const g of ranges) for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
    const k = key(r, c)
    if (!seen.has(k)) { seen.add(k); fn(r, c) }
  }
}

const isEmptyCell = (c: Cell) => c.v === '' && (!c.s || Object.keys(c.s).length === 0)

/** Writes raw input of a cell, keeping its style */
export function setRaw(sh: Sheet, r: number, c: number, raw: string, extraStyle?: CellStyle): Sheet {
  const k = key(r, c)
  const old = sh.cells[k]
  const cells = { ...sh.cells }
  const s = extraStyle ? { ...old?.s, ...extraStyle } : old?.s
  const next: Cell = { v: raw, ...(s && Object.keys(s).length ? { s } : {}) }
  if (isEmptyCell(next)) delete cells[k]
  else cells[k] = next
  return { ...sh, cells }
}

/** Converts what a user typed into the stored raw string (+ number format guessed from the input) */
export function interpretInput(text: string, existingFmt?: string): { raw: string; fmt?: string } {
  if (text === '') return { raw: '' }
  if (text[0] === '=') return { raw: text }
  if (text[0] === "'") return { raw: text }
  const t = parseTyped(text)
  if (t) return { raw: String(t.num), fmt: t.fmt && (!existingFmt || existingFmt === 'General') ? t.fmt : undefined }
  if (/^(true|vrai)$/i.test(text.trim())) return { raw: 'TRUE' }
  if (/^(false|faux)$/i.test(text.trim())) return { raw: 'FALSE' }
  // text that would otherwise be read as a number/boolean/formula must be protected
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text)) return { raw: "'" + text }
  return { raw: text }
}

export function patchStyle(sh: Sheet, ranges: Range[], patch: (s: CellStyle) => CellStyle): Sheet {
  const cells = { ...sh.cells }
  forEachCell(ranges, (r, c) => {
    const k = key(r, c)
    const old = cells[k]
    const s = patch({ ...(old?.s ?? {}) })
    for (const kk of Object.keys(s) as (keyof CellStyle)[]) if (s[kk] === undefined) delete s[kk]
    const next: Cell = { v: old?.v ?? '', ...(Object.keys(s).length ? { s } : {}) }
    if (isEmptyCell(next)) delete cells[k]
    else cells[k] = next
  })
  return { ...sh, cells }
}

export function clearCells(sh: Sheet, ranges: Range[], what: 'all' | 'contents' | 'formats'): Sheet {
  const cells = { ...sh.cells }
  forEachCell(ranges, (r, c) => {
    const k = key(r, c)
    const old = cells[k]
    if (!old) return
    const next: Cell = what === 'all' ? { v: '' } : what === 'contents' ? { v: '', ...(old.s ? { s: old.s } : {}) } : { v: old.v }
    if (isEmptyCell(next)) delete cells[k]
    else cells[k] = next
  })
  return { ...sh, cells }
}

export function usedRange(sh: Sheet): Range | null {
  let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1
  for (const [k, cell] of Object.entries(sh.cells)) {
    if (cell.v === '') continue
    const [r, c] = k.split(',').map(Number) as [number, number]
    r1 = Math.min(r1, r); c1 = Math.min(c1, c); r2 = Math.max(r2, r); c2 = Math.max(c2, c)
  }
  return r2 < 0 ? null : { r1, c1, r2, c2 }
}

/** Contiguous block of data around a cell (like Ctrl+A / "current region") */
export function currentRegion(sh: Sheet, r: number, c: number): Range {
  const has = (rr: number, cc: number) => (sh.cells[key(rr, cc)]?.v ?? '') !== ''
  let g: Range = { r1: r, c1: c, r2: r, c2: c }
  let grew = true
  while (grew) {
    grew = false
    for (let rr = g.r1 - 1; rr <= g.r2 + 1; rr++) for (let cc = g.c1 - 1; cc <= g.c2 + 1; cc++) {
      if (rr < 0 || cc < 0 || inRange(g, rr, cc)) continue
      if (has(rr, cc)) { g = { r1: Math.min(g.r1, rr), c1: Math.min(g.c1, cc), r2: Math.max(g.r2, rr), c2: Math.max(g.c2, cc) }; grew = true }
    }
  }
  return g
}

// ── clipboard ────────────────────────────────────────────────────────────────

export interface ClipData {
  src: Range
  sheetName: string
  cells: (Cell | undefined)[][]
  cut: boolean
}

export function copyRange(sh: Sheet, range: Range, cut: boolean): ClipData {
  const cells: (Cell | undefined)[][] = []
  for (let r = range.r1; r <= range.r2; r++) {
    const row: (Cell | undefined)[] = []
    for (let c = range.c1; c <= range.c2; c++) row.push(sh.cells[key(r, c)])
    cells.push(row)
  }
  return { src: range, sheetName: sh.name, cells, cut }
}

export type PasteMode = 'all' | 'values' | 'formats' | 'formulas' | 'transpose'

export function pasteClip(wb: Workbook, si: number, at: Pos, clip: ClipData, mode: PasteMode, valueOf: (r: number, c: number) => V): Workbook {
  const rows = clip.cells.length, cols = clip.cells[0]?.length ?? 0
  let out = wb
  const srcSheetIdx = wb.sheets.findIndex((s) => s.name === clip.sheetName)
  const sameSheet = srcSheetIdx === si
  out = updateSheet(out, si, (sh) => {
    const cells = { ...sh.cells }
    // cut: clear the source first
    if (clip.cut && sameSheet) {
      for (let r = clip.src.r1; r <= clip.src.r2; r++) for (let c = clip.src.c1; c <= clip.src.c2; c++) delete cells[key(r, c)]
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const [tr, tc] = mode === 'transpose' ? [at.r + j, at.c + i] : [at.r + i, at.c + j]
      const src = clip.cells[i]![j]
      const k = key(tr, tc)
      const old = cells[k]
      let raw = src?.v ?? ''
      if (raw[0] === '=' && mode !== 'values') {
        raw = clip.cut ? raw : shiftFormula(raw, tr - (clip.src.r1 + i), tc - (clip.src.c1 + j))
        if (mode === 'transpose') raw = src!.v
      } else if (raw[0] === '=') {
        const v = valueOf(clip.src.r1 + i, clip.src.c1 + j)
        raw = v === null ? '' : v instanceof FErr ? v.code : typeof v === 'string' ? (/^[=']/.test(v) || /^[-+]?\d+(\.\d+)?$/.test(v) ? "'" + v : v) : String(v)
      }
      let next: Cell
      if (mode === 'formats') next = { v: old?.v ?? '', ...(src?.s ? { s: src.s } : {}) }
      else if (mode === 'values' || mode === 'formulas') next = { v: raw, ...(old?.s ? { s: old.s } : {}) }
      else next = { v: raw, ...(src?.s ? { s: src.s } : {}) }
      if (isEmptyCell(next)) delete cells[k]
      else cells[k] = next
    }
    return { ...sh, cells }
  })
  // cut from another sheet
  if (clip.cut && !sameSheet && srcSheetIdx >= 0) out = updateSheet(out, srcSheetIdx, (sh) => clearCells(sh, [clip.src], 'all'))
  // cut: references to moved cells keep pointing at them (simplified: not rewritten)
  return out
}

export function parseTSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false } else cur += ch
    } else if (ch === '"' && cur === '') inQ = true
    else if (ch === '\t') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

export function toTSV(rows: string[][]): string {
  return rows.map((r) => r.map((t) => (/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)).join('\t')).join('\n')
}

// ── structure ────────────────────────────────────────────────────────────────

export function shiftIndexMap(m: Record<number, number>, at: number, count: number): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [k, v] of Object.entries(m)) {
    const i = Number(k)
    if (count > 0) out[i >= at ? i + count : i] = v
    else if (i < at) out[i] = v
    else if (i >= at - count) out[i + count] = v
  }
  return out
}

/** Inserts (count>0) or deletes (count<0) rows/columns; formulas of the whole workbook are updated. */
export function restructure(wb: Workbook, si: number, axis: 'row' | 'col', at: number, count: number): Workbook {
  const target = wb.sheets[si]!
  const n = Math.abs(count)
  const sheets = wb.sheets.map((sh, i) => {
    const cells: Record<string, Cell> = {}
    for (const [k, cell] of Object.entries(sh.cells)) {
      let [r, c] = k.split(',').map(Number) as [number, number]
      let v = cell.v
      if (v[0] === '=') v = adjustFormula(v, sh.name, target.name, axis, at, count)
      if (i === si) {
        const idx = axis === 'row' ? r : c
        if (count > 0) { if (idx >= at) (axis === 'row' ? (r += count) : (c += count)) }
        else if (idx >= at && idx < at + n) continue
        else if (idx >= at + n) (axis === 'row' ? (r -= n) : (c -= n))
      }
      cells[key(r, c)] = v === cell.v ? cell : { ...cell, v }
    }
    if (i !== si) return { ...sh, cells }
    const mapRange = (g: Range): Range | null => {
      const lo = axis === 'row' ? g.r1 : g.c1, hi = axis === 'row' ? g.r2 : g.c2
      let a: number, b: number
      if (count > 0) { a = lo >= at ? lo + count : lo; b = hi >= at ? hi + count : hi }
      else {
        a = lo < at ? lo : lo >= at + n ? lo - n : at
        b = hi < at ? hi : hi >= at + n ? hi - n : at - 1
        if (b < a) return null
      }
      return axis === 'row' ? { ...g, r1: a, r2: b } : { ...g, c1: a, c2: b }
    }
    const hidden = (axis === 'row' ? sh.hiddenRows : sh.hiddenCols).map((i2) => (count > 0 ? (i2 >= at ? i2 + count : i2) : i2 < at ? i2 : i2 >= at + n ? i2 - n : -1)).filter((x) => x >= 0)
    return {
      ...sh, cells,
      rows: axis === 'row' ? Math.max(1, sh.rows + count) : sh.rows,
      cols: axis === 'col' ? Math.max(1, sh.cols + count) : sh.cols,
      rowH: axis === 'row' ? shiftIndexMap(sh.rowH, at, count) : sh.rowH,
      colW: axis === 'col' ? shiftIndexMap(sh.colW, at, count) : sh.colW,
      merges: sh.merges.map(mapRange).filter((g): g is Range => !!g),
      rules: sh.rules.map((ru) => ({ ...ru, range: mapRange(ru.range) as Range })).filter((ru) => ru.range) as CondRule[],
      hiddenRows: axis === 'row' ? hidden : sh.hiddenRows,
      hiddenCols: axis === 'col' ? hidden : sh.hiddenCols,
    }
  })
  return { ...wb, sheets }
}

// ── merge ────────────────────────────────────────────────────────────────────

export function mergeCells(sh: Sheet, g: Range): Sheet {
  if (g.r1 === g.r2 && g.c1 === g.c2) return sh
  const cells = { ...sh.cells }
  for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if (r !== g.r1 || c !== g.c1) delete cells[key(r, c)]
  return { ...sh, cells, merges: [...sh.merges.filter((m) => !(m.r1 <= g.r2 && m.r2 >= g.r1 && m.c1 <= g.c2 && m.c2 >= g.c1)), g] }
}

export const unmergeCells = (sh: Sheet, g: Range): Sheet => ({ ...sh, merges: sh.merges.filter((m) => !(m.r1 <= g.r2 && m.r2 >= g.r1 && m.c1 <= g.c2 && m.c2 >= g.c1)) })

// ── fill series ──────────────────────────────────────────────────────────────

function lastNumberSplit(s: string): { head: string; n: number; width: number; tail: string } | null {
  const m = s.match(/^(.*?)(\d+)(\D*)$/)
  return m ? { head: m[1]!, n: parseInt(m[2]!, 10), width: m[2]!.length, tail: m[3]! } : null
}

/** Auto-fill: extends the source range to the target range (same rows or same columns) */
export function fillSeries(sh: Sheet, src: Range, dst: Range): Sheet {
  const vertical = dst.c1 === src.c1 && dst.c2 === src.c2
  const cells = { ...sh.cells }
  const forward = vertical ? dst.r2 > src.r2 : dst.c2 > src.c2
  const n = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1
  const lines = vertical ? src.c2 - src.c1 + 1 : src.r2 - src.r1 + 1
  const count = vertical ? (forward ? dst.r2 - src.r2 : src.r1 - dst.r1) : (forward ? dst.c2 - src.c2 : src.c1 - dst.c1)
  for (let line = 0; line < lines; line++) {
    const at = (i: number): Pos => (vertical ? { r: src.r1 + i, c: src.c1 + line } : { r: src.r1 + line, c: src.c1 + i })
    const srcCells = Array.from({ length: n }, (_, i) => cells[key(at(i).r, at(i).c)])
    const raws = srcCells.map((c) => c?.v ?? '')
    const nums = raws.map((v) => (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(v) ? parseFloat(v) : null))
    const allNum = n >= 1 && nums.every((x) => x !== null) && raws.every((v) => v[0] !== '=')
    let step = 0
    if (allNum) step = n === 1 ? (raws[0] !== '' && srcCells[0]?.s?.fmt && /[dmy]/i.test(srcCells[0].s!.fmt!) ? 1 : 1) : nums[1]! - nums[0]!
    if (allNum && n === 1) step = 1
    for (let k = 1; k <= count; k++) {
      const idx = forward ? k : -k
      const target = forward ? at(n - 1 + k) : at(-k)
      const srcIdx = ((idx - (forward ? 1 : 0)) % n + n) % n
      const base = srcCells[forward ? (k - 1) % n : (n - ((k - 1) % n) - 1) % n]
      void srcIdx
      let raw = base?.v ?? ''
      if (allNum) raw = String(forward ? nums[n - 1]! + step * k : nums[0]! - step * k)
      else if (raw[0] === '=') {
        const baseAt = forward ? at((k - 1) % n) : at((n - ((k - 1) % n) - 1) % n)
        raw = shiftFormula(raw, target.r - baseAt.r, target.c - baseAt.c)
      } else if (n === 1 || raws.every((x) => lastNumberSplit(x))) {
        const sp = lastNumberSplit(raw)
        if (sp && raws.length === 1) raw = sp.head + String(Math.max(0, sp.n + (forward ? k : -k))).padStart(sp.width, '0') + sp.tail
      }
      const tk = key(target.r, target.c)
      const next: Cell = { v: raw, ...(base?.s ? { s: base.s } : {}) }
      if (isEmptyCell(next)) delete cells[tk]
      else cells[tk] = next
    }
  }
  return { ...sh, cells }
}

// ── sort ─────────────────────────────────────────────────────────────────────

export function sortRange(sh: Sheet, g: Range, col: number, asc: boolean, valueOf: (r: number, c: number) => V, header: boolean): Sheet {
  const start = header ? g.r1 + 1 : g.r1
  const rows: number[] = []
  for (let r = start; r <= g.r2; r++) rows.push(r)
  const cmp = (a: V, b: V) => {
    if (a === null || a === '') return b === null || b === '' ? 0 : 1
    if (b === null || b === '') return -1
    if (typeof a === 'number' && typeof b === 'number') return a - b
    if (typeof a === 'number') return -1
    if (typeof b === 'number') return 1
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true })
  }
  const sorted = [...rows].sort((x, y) => {
    const a = valueOf(x, col), b = valueOf(y, col)
    const emptyA = a === null || a === '', emptyB = b === null || b === ''
    if (emptyA || emptyB) return cmp(a, b)
    return asc ? cmp(a, b) : cmp(b, a)
  })
  const cells = { ...sh.cells }
  const snapshot = new Map<number, (Cell | undefined)[]>()
  for (const r of rows) snapshot.set(r, Array.from({ length: g.c2 - g.c1 + 1 }, (_, j) => sh.cells[key(r, g.c1 + j)]))
  sorted.forEach((srcRow, i) => {
    const dstRow = rows[i]!
    const line = snapshot.get(srcRow)!
    line.forEach((cell, j) => {
      const k = key(dstRow, g.c1 + j)
      if (!cell) { delete cells[k]; return }
      cells[k] = cell.v[0] === '=' ? { ...cell, v: shiftFormula(cell.v, dstRow - srcRow, 0) } : cell
    })
  })
  return { ...sh, cells }
}

export function looksLikeHeader(g: Range, valueOf: (r: number, c: number) => V): boolean {
  if (g.r2 <= g.r1) return false
  let strings = 0, below = 0
  for (let c = g.c1; c <= g.c2; c++) {
    if (typeof valueOf(g.r1, c) === 'string') strings++
    if (typeof valueOf(g.r1 + 1, c) === 'number') below++
  }
  return strings > 0 && (below > 0 || strings === g.c2 - g.c1 + 1)
}

// ── borders ──────────────────────────────────────────────────────────────────

export type BorderPreset = 'all' | 'outer' | 'none' | 'top' | 'bottom' | 'left' | 'right' | 'inner' | 'topBottom'

export function applyBorders(sh: Sheet, ranges: Range[], preset: BorderPreset, b: Border): Sheet {
  let out = sh
  for (const g of ranges) {
    out = patchStyleAt(out, g, (r, c, s) => {
      const top = r === g.r1, bottom = r === g.r2, left = c === g.c1, right = c === g.c2
      const set = (side: 'bt' | 'br' | 'bb' | 'bl', on: boolean) => { if (on) s[side] = b }
      const clear = () => { delete s.bt; delete s.br; delete s.bb; delete s.bl }
      switch (preset) {
        case 'none': clear(); break
        case 'all': set('bt', true); set('br', true); set('bb', true); set('bl', true); break
        case 'outer': set('bt', top); set('bb', bottom); set('bl', left); set('br', right); break
        case 'inner': set('bt', !top); set('bb', !bottom); set('bl', !left); set('br', !right); break
        case 'top': set('bt', top); break
        case 'bottom': set('bb', bottom); break
        case 'left': set('bl', left); break
        case 'right': set('br', right); break
        case 'topBottom': set('bt', top); set('bb', bottom); break
      }
      return s
    })
  }
  return out
}

function patchStyleAt(sh: Sheet, g: Range, fn: (r: number, c: number, s: CellStyle) => CellStyle): Sheet {
  const cells = { ...sh.cells }
  for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
    const k = key(r, c)
    const old = cells[k]
    const s = fn(r, c, { ...(old?.s ?? {}) })
    const next: Cell = { v: old?.v ?? '', ...(Object.keys(s).length ? { s } : {}) }
    if (isEmptyCell(next)) delete cells[k]
    else cells[k] = next
  }
  return { ...sh, cells }
}

/** Display string of a value (used by search, CSV, status bar) */
export const displayOf = (v: V, fmt?: string) => formatValue(v, fmt).text

export { mergeAt }
