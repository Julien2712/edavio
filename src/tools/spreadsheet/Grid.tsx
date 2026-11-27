import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Calc } from './formula'
import { formatValue } from './format'
import { COL_HEADER_H, DEFAULT_FONT, DEFAULT_SIZE, ROW_HEADER_W, colName, inRange, key, mergeAt, type Range, type Sheet } from './model'
import { allRanges, selRange, single, type Sel } from './ops'
import type { V } from './formula'

export interface CfResult { bg?: string; color?: string; bold?: boolean; bar?: number; barColor?: string }

export interface Editing { r: number; c: number; text: string; mode: 'enter' | 'edit' }

export interface GridHandle {
  reveal: (r: number, c: number) => void
}

interface Props {
  sheet: Sheet
  calc: Calc
  zoom: number
  rowSizes: number[]
  colSizes: number[]
  sel: Sel
  showFormulas: boolean
  editing: Editing | null
  clip: Range | null
  filterRange: Range | null
  cf: (r: number, c: number, v: V) => CfResult | null
  painterActive: boolean
  onSelect: (s: Sel) => void
  onStartEdit: (r: number, c: number, text?: string) => void
  onEditChange: (text: string) => void
  onEditKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onEditBlur: () => void
  onPoint: (r: number, c: number) => boolean
  onResize: (kind: 'col' | 'row', index: number, size: number, phase: 'start' | 'move' | 'end') => void
  onAutoFit: (kind: 'col' | 'row', index: number) => void
  onFill: (src: Range, dst: Range) => void
  onNeedMore: (axis: 'rows' | 'cols') => void
  onContext: (x: number, y: number) => void
  onFilterClick: (col: number, rect: DOMRect) => void
  onZoom: (dir: 1 | -1) => void
  onPaintApply: () => void
  overlay?: React.ReactNode
  validationItems?: string[] | null
  onPickValidation?: (v: string) => void
}

const upper = (off: number[], v: number) => {
  let lo = 0, hi = off.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (off[mid]! <= v) lo = mid
    else hi = mid - 1
  }
  return lo
}

const BORDER_W = { thin: 1, medium: 2, thick: 3, dashed: 1, dotted: 1, double: 3 } as const
const bcss = (b?: { style: keyof typeof BORDER_W; color: string }) => (b ? `${BORDER_W[b.style]}px ${b.style === 'dashed' || b.style === 'dotted' || b.style === 'double' ? b.style : 'solid'} ${b.color}` : undefined)

export const Grid = memo(forwardRef<GridHandle, Props>(function Grid(p, ref) {
  const { sheet, calc, zoom, rowSizes, colSizes, sel } = p
  const scroller = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const [view, setView] = useState({ w: 800, h: 500 })
  const drag = useRef<null | { kind: 'select' | 'col' | 'row' | 'resize' | 'fill'; [k: string]: unknown }>(null)
  const [fillPreview, setFillPreview] = useState<Range | null>(null)
  const pRef = useRef(p)
  pRef.current = p

  const colOff = useMemo(() => {
    const o = [0]
    for (let c = 0; c < sheet.cols; c++) o.push(o[c]! + colSizes[c]! * zoom)
    return o
  }, [sheet.cols, colSizes, zoom])
  const rowOff = useMemo(() => {
    const o = [0]
    for (let r = 0; r < sheet.rows; r++) o.push(o[r]! + rowSizes[r]! * zoom)
    return o
  }, [sheet.rows, rowSizes, zoom])
  const totalW = colOff[sheet.cols]!, totalH = rowOff[sheet.rows]!
  const fw = colOff[Math.min(sheet.freezeC, sheet.cols)]!, fh = rowOff[Math.min(sheet.freezeR, sheet.rows)]!

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setView({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const colAt = useCallback((x: number) => { let i = upper(colOff, x); while (i > 0 && colSizes[i] === 0) i--; return Math.max(0, Math.min(sheet.cols - 1, i)) }, [colOff, colSizes, sheet.cols])
  const rowAt = useCallback((y: number) => { let i = upper(rowOff, y); while (i > 0 && rowSizes[i] === 0) i--; return Math.max(0, Math.min(sheet.rows - 1, i)) }, [rowOff, rowSizes, sheet.rows])

  const hit = useCallback((cx: number, cy: number) => {
    const rect = scroller.current!.getBoundingClientRect()
    const x = cx - rect.left, y = cy - rect.top
    const gx = x < fw ? x : x + scroll.x, gy = y < fh ? y : y + scroll.y
    return { r: rowAt(Math.max(0, gy)), c: colAt(Math.max(0, gx)), x, y, rect }
  }, [fw, fh, scroll, rowAt, colAt])

  useImperativeHandle(ref, () => ({
    reveal(r, c) {
      const el = scroller.current
      if (!el) return
      let { scrollLeft, scrollTop } = el
      if (c >= sheet.freezeC) {
        const l = colOff[c]!, rgt = colOff[c + 1]!
        if (l - fw < scrollLeft) scrollLeft = l - fw
        else if (rgt > scrollLeft + el.clientWidth) scrollLeft = rgt - el.clientWidth
      }
      if (r >= sheet.freezeR) {
        const t = rowOff[r]!, b = rowOff[r + 1]!
        if (t - fh < scrollTop) scrollTop = t - fh
        else if (b > scrollTop + el.clientHeight) scrollTop = b - el.clientHeight
      }
      if (scrollLeft !== el.scrollLeft) el.scrollLeft = scrollLeft
      if (scrollTop !== el.scrollTop) el.scrollTop = scrollTop
    },
  }), [colOff, rowOff, fw, fh, sheet.freezeC, sheet.freezeR])

  // visible window
  const c0 = Math.max(0, colAt(scroll.x + fw) - 2), c1 = Math.min(sheet.cols - 1, colAt(scroll.x + view.w) + 2)
  const r0 = Math.max(0, rowAt(scroll.y + fh) - 3), r1 = Math.min(sheet.rows - 1, rowAt(scroll.y + view.h) + 3)
  const colsVis = useMemo(() => {
    const a: number[] = []
    for (let c = 0; c < Math.min(sheet.freezeC, sheet.cols); c++) a.push(c)
    for (let c = Math.max(c0, sheet.freezeC); c <= c1; c++) a.push(c)
    return a
  }, [c0, c1, sheet.freezeC, sheet.cols])
  const rowsVis = useMemo(() => {
    const a: number[] = []
    for (let r = 0; r < Math.min(sheet.freezeR, sheet.rows); r++) a.push(r)
    for (let r = Math.max(r0, sheet.freezeR); r <= r1; r++) a.push(r)
    return a
  }, [r0, r1, sheet.freezeR, sheet.rows])

  const onScroll = () => {
    const el = scroller.current!
    setScroll({ x: el.scrollLeft, y: el.scrollTop })
    if (el.scrollTop + el.clientHeight > totalH - 300) p.onNeedMore('rows')
    if (el.scrollLeft + el.clientWidth > totalW - 300) p.onNeedMore('cols')
  }

  // wheel zoom
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const h = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      pRef.current.onZoom(e.deltaY < 0 ? 1 : -1)
    }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])

  // ── pointer handling ───────────────────────────────────────────────────────
  const extend = (sel0: Sel, r: number, c: number): Sel => {
    let anchor = sel0.anchor
    let focus = { r, c }
    // keep merged cells whole
    return { ...sel0, anchor, focus }
  }

  const finishDrag = useRef<() => void>(() => undefined)
  finishDrag.current = () => {
    window.removeEventListener('pointermove', onMoveRef.current)
    window.removeEventListener('pointerup', onUpRef.current)
    clearInterval(autoScroll.current)
  }
  const autoScroll = useRef<ReturnType<typeof setInterval>>(undefined as unknown as ReturnType<typeof setInterval>)
  const lastPtr = useRef({ x: 0, y: 0 })

  const onMoveRef = useRef<(e: PointerEvent) => void>(() => undefined)
  const onUpRef = useRef<() => void>(() => undefined)

  onMoveRef.current = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    lastPtr.current = { x: e.clientX, y: e.clientY }
    const el = scroller.current!
    const rect = el.getBoundingClientRect()
    if (d.kind === 'resize') {
      const size = Math.max(0, (d.start as number) + ((d.axis === 'col' ? e.clientX : e.clientY) - (d.from as number)) / zoom)
      pRef.current.onResize(d.axis as 'col' | 'row', d.index as number, size, 'move')
      return
    }
    // autoscroll near edges
    clearInterval(autoScroll.current)
    const dx = e.clientX < rect.left + 20 ? -25 : e.clientX > rect.right - 20 ? 25 : 0
    const dy = e.clientY < rect.top + 20 ? -25 : e.clientY > rect.bottom - 20 ? 25 : 0
    if ((dx || dy) && d.kind !== 'col' && d.kind !== 'row') autoScroll.current = setInterval(() => { el.scrollLeft += dx; el.scrollTop += dy; apply(lastPtr.current.x, lastPtr.current.y) }, 40)
    apply(e.clientX, e.clientY)
  }
  const apply = (cx: number, cy: number) => {
    const d = drag.current
    if (!d) return
    const cur = pRef.current
    const h = hit(cx, cy)
    if (d.kind === 'select') {
      cur.onSelect(extend(cur.sel, h.r, h.c))
    } else if (d.kind === 'col') {
      cur.onSelect({ ...cur.sel, anchor: { r: 0, c: (d.anchor as number) }, focus: { r: cur.sheet.rows - 1, c: h.c } })
    } else if (d.kind === 'row') {
      cur.onSelect({ ...cur.sel, anchor: { r: (d.anchor as number), c: 0 }, focus: { r: h.r, c: cur.sheet.cols - 1 } })
    } else if (d.kind === 'fill') {
      const src = d.src as Range
      const dr = h.r > src.r2 ? h.r - src.r2 : h.r < src.r1 ? h.r - src.r1 : 0
      const dc = h.c > src.c2 ? h.c - src.c2 : h.c < src.c1 ? h.c - src.c1 : 0
      if (!dr && !dc) { setFillPreview(null); return }
      const dst: Range = Math.abs(dr) >= Math.abs(dc)
        ? { r1: dr < 0 ? h.r : src.r1, r2: dr > 0 ? h.r : src.r2, c1: src.c1, c2: src.c2 }
        : { c1: dc < 0 ? h.c : src.c1, c2: dc > 0 ? h.c : src.c2, r1: src.r1, r2: src.r2 }
      setFillPreview(dst)
    }
  }
  onUpRef.current = () => {
    const d = drag.current
    drag.current = null
    finishDrag.current()
    if (!d) return
    if (d.kind === 'resize') pRef.current.onResize(d.axis as 'col' | 'row', d.index as number, -1, 'end')
    if (d.kind === 'fill') {
      setFillPreview((prev) => {
        if (prev) pRef.current.onFill(d.src as Range, prev)
        return null
      })
    }
    if (d.kind === 'select' && pRef.current.painterActive) pRef.current.onPaintApply()
  }

  const begin = (d: NonNullable<typeof drag.current>) => {
    drag.current = d
    window.addEventListener('pointermove', onMoveRef.current)
    window.addEventListener('pointerup', onUpRef.current)
  }

  const onCellDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('[data-filter]') || t.closest('textarea')) return
    const h = hit(e.clientX, e.clientY)
    if (t.closest('[data-fill]')) {
      e.preventDefault()
      begin({ kind: 'fill', src: selRange(p.sel) })
      return
    }
    if (e.button === 2) {
      const inside = allRanges(p.sel).some((g) => inRange(g, h.r, h.c))
      if (!inside) p.onSelect(single(h.r, h.c))
      return
    }
    if (e.button !== 0) return
    if (p.editing) {
      if (p.onPoint(h.r, h.c)) { e.preventDefault(); return }
    }
    const m = mergeAt(sheet, h.r, h.c)
    if (e.shiftKey) p.onSelect(extend(p.sel, h.r, h.c))
    else if (e.ctrlKey || e.metaKey) p.onSelect({ anchor: { r: h.r, c: h.c }, focus: { r: h.r, c: h.c }, extra: [...allRanges(p.sel)] })
    else if (m) p.onSelect({ anchor: { r: m.r1, c: m.c1 }, focus: { r: m.r2, c: m.c2 }, extra: [] })
    else p.onSelect(single(h.r, h.c))
    begin({ kind: 'select' })
    scroller.current?.focus()
  }

  const beginResize = (e: React.PointerEvent, axis: 'col' | 'row', index: number) => {
    e.preventDefault()
    e.stopPropagation()
    const start = axis === 'col' ? colSizes[index]! : rowSizes[index]!
    p.onResize(axis, index, start, 'start')
    begin({ kind: 'resize', axis, index, start, from: axis === 'col' ? e.clientX : e.clientY })
  }

  const onColDown = (e: React.PointerEvent, c: number) => {
    if (e.button === 2) { if (!(selRange(p.sel).c1 <= c && selRange(p.sel).c2 >= c && selRange(p.sel).r1 === 0 && selRange(p.sel).r2 === sheet.rows - 1)) p.onSelect({ anchor: { r: 0, c }, focus: { r: sheet.rows - 1, c }, extra: [] }); return }
    if (e.button !== 0) return
    const anchor = e.shiftKey ? p.sel.anchor.c : c
    p.onSelect(e.ctrlKey || e.metaKey ? { anchor: { r: 0, c }, focus: { r: sheet.rows - 1, c }, extra: allRanges(p.sel) } : { anchor: { r: 0, c: anchor }, focus: { r: sheet.rows - 1, c }, extra: [] })
    begin({ kind: 'col', anchor })
  }
  const onRowDown = (e: React.PointerEvent, r: number) => {
    if (e.button === 2) { if (!(selRange(p.sel).r1 <= r && selRange(p.sel).r2 >= r && selRange(p.sel).c1 === 0 && selRange(p.sel).c2 === sheet.cols - 1)) p.onSelect({ anchor: { r, c: 0 }, focus: { r, c: sheet.cols - 1 }, extra: [] }); return }
    if (e.button !== 0) return
    const anchor = e.shiftKey ? p.sel.anchor.r : r
    p.onSelect(e.ctrlKey || e.metaKey ? { anchor: { r, c: 0 }, focus: { r, c: sheet.cols - 1 }, extra: allRanges(p.sel) } : { anchor: { r: anchor, c: 0 }, focus: { r, c: sheet.cols - 1 }, extra: [] })
    begin({ kind: 'row', anchor })
  }

  useEffect(() => () => { clearInterval(autoScroll.current); window.removeEventListener('pointermove', onMoveRef.current); window.removeEventListener('pointerup', onUpRef.current) }, [])

  // ── rendering helpers ──────────────────────────────────────────────────────
  const ranges = allRanges(sel)
  const prim = selRange(sel)
  const rectOf = (g: Range) => {
    let left = colOff[g.c1]!, top = rowOff[g.r1]!
    const width = colOff[g.c2 + 1]! - left, height = rowOff[g.r2 + 1]! - top
    if (g.c2 < sheet.freezeC) left += scroll.x
    if (g.r2 < sheet.freezeR) top += scroll.y
    return { left, top, width, height }
  }
  const fz = (n: number) => n * zoom
  const wholeCol = (c: number) => ranges.some((g) => g.c1 <= c && g.c2 >= c && g.r1 === 0 && g.r2 >= sheet.rows - 1)
  const wholeRow = (r: number) => ranges.some((g) => g.r1 <= r && g.r2 >= r && g.c1 === 0 && g.c2 >= sheet.cols - 1)
  const colSel = (c: number) => ranges.some((g) => g.c1 <= c && g.c2 >= c)
  const rowSel = (r: number) => ranges.some((g) => g.r1 <= r && g.r2 >= r)

  const cells: React.ReactNode[] = []
  for (const r of rowsVis) {
    if (rowSizes[r] === 0) continue
    for (const c of colsVis) {
      if (colSizes[c] === 0) continue
      const m = mergeAt(sheet, r, c)
      if (m && (r !== m.r1 || c !== m.c1)) continue
      const cell = sheet.cells[key(r, c)]
      const s = cell?.s
      const val = cell && cell.v !== '' ? valueAt(calc, sheet, r, c) : null
      const fmtd = p.showFormulas && cell?.v ? { text: cell.v, align: 'left' as const, color: undefined } : formatValue(val, s?.fmt)
      const cf = p.cf(r, c, val)
      const x1 = m ? m.c2 : c, y1 = m ? m.r2 : r
      let left = colOff[c]!, top = rowOff[r]!
      const width = colOff[x1 + 1]! - left, height = rowOff[y1 + 1]! - top
      const frozenC = c < sheet.freezeC, frozenR = r < sheet.freezeR
      if (frozenC) left += scroll.x
      if (frozenR) top += scroll.y
      const h = s?.h && s.h !== 'general' ? s.h : fmtd.align
      const editingHere = p.editing && p.editing.r === r && p.editing.c === c
      const nextEmpty = !s?.wrap && h === 'left' && typeof val === 'string' && (sheet.cells[key(r, x1 + 1)]?.v ?? '') === '' && !mergeAt(sheet, r, x1 + 1)
      const justify = h === 'left' ? 'flex-start' : h === 'right' ? 'flex-end' : 'center'
      const align = s?.v === 'top' ? 'flex-start' : s?.v === 'middle' ? 'center' : 'flex-end'
      const bg = cf?.bg ?? s?.bg ?? (frozenC || frozenR ? '#ffffff' : undefined)
      cells.push(
        <div
          key={`${r},${c}`}
          data-cell={`${r},${c}`}
          style={{
            position: 'absolute', left, top, width, height, boxSizing: 'border-box',
            background: bg,
            borderRight: bcss(s?.br) ?? (sheet.showGrid ? '1px solid #e2e8f0' : undefined),
            borderBottom: bcss(s?.bb) ?? (sheet.showGrid ? '1px solid #e2e8f0' : undefined),
            borderTop: bcss(s?.bt), borderLeft: bcss(s?.bl),
            display: 'flex', alignItems: align, justifyContent: justify,
            padding: `0 ${fz(3)}px`, paddingLeft: fz(3) + (s?.indent ?? 0) * fz(9),
            overflow: nextEmpty ? 'visible' : 'hidden', zIndex: frozenC && frozenR ? 4 : frozenC || frozenR ? 3 : nextEmpty ? 2 : s?.bt || s?.bl || s?.br || s?.bb ? 1 : 0,
            fontFamily: `'${s?.font ?? DEFAULT_FONT}', 'Segoe UI', Arial, sans-serif`,
            fontSize: ((s?.size ?? DEFAULT_SIZE) * 96) / 72 * zoom,
            fontWeight: cf?.bold || s?.bold ? 700 : 400, fontStyle: s?.italic ? 'italic' : undefined,
            textDecoration: [s?.underline ? 'underline' : '', s?.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
            color: cf?.color ?? s?.color ?? fmtd.color ?? '#111827',
            whiteSpace: s?.wrap ? 'pre-wrap' : 'nowrap', wordBreak: s?.wrap ? 'break-word' : undefined, lineHeight: 1.25,
            userSelect: 'none',
          }}
        >
          {cf?.bar !== undefined && <div style={{ position: 'absolute', left: 1, top: 2, bottom: 2, width: `${Math.max(0, Math.min(1, cf.bar)) * (100) - 2}%`, background: cf.barColor ?? '#93c5fd', opacity: 0.6, zIndex: -1 }} />}
          {!editingHere && <span style={{ textAlign: h, width: s?.wrap ? '100%' : undefined, display: 'block', overflow: s?.wrap ? 'hidden' : undefined }}>{fmtd.text}</span>}
          {p.filterRange && r === p.filterRange.r1 && c >= p.filterRange.c1 && c <= p.filterRange.c2 && (
            <button type="button" data-filter aria-label="Filtre" onClick={(e) => p.onFilterClick(c, e.currentTarget.getBoundingClientRect())}
              className="absolute bottom-0.5 right-0.5 flex size-4 items-center justify-center rounded-sm border border-slate-400 bg-white text-slate-600 hover:bg-slate-100">
              <ChevronDown size={11} />
            </button>
          )}
        </div>,
      )
    }
  }

  const ed = p.editing
  const edRect = ed ? (() => { const m = mergeAt(sheet, ed.r, ed.c); return rectOf(m ?? { r1: ed.r, c1: ed.c, r2: ed.r, c2: ed.c }) })() : null
  const edStyle = ed ? sheet.cells[key(ed.r, ed.c)]?.s : undefined

  const showHandle = !p.editing
  const primRect = rectOf(prim)

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-white text-[#111827]" onContextMenu={(e) => { e.preventDefault(); p.onContext(e.clientX, e.clientY) }}>
      {/* corner */}
      <div className="absolute left-0 top-0 z-20 border-b border-r border-slate-300 bg-slate-100" style={{ width: ROW_HEADER_W, height: COL_HEADER_H }}
        onPointerDown={(e) => { if (e.button === 0) p.onSelect({ anchor: { r: 0, c: 0 }, focus: { r: sheet.rows - 1, c: sheet.cols - 1 }, extra: [] }) }}>
        <svg viewBox="0 0 10 10" className="absolute bottom-1 right-1 size-3 text-slate-400"><path d="M10 0 L10 10 L0 10 Z" fill="currentColor" /></svg>
      </div>
      {/* column headers */}
      <div className="absolute top-0 z-10 overflow-hidden bg-slate-100" style={{ left: ROW_HEADER_W, right: 0, height: COL_HEADER_H }}>
        {colsVis.map((c) => {
          if (colSizes[c] === 0) return null
          const left = c < sheet.freezeC ? colOff[c]! : colOff[c]! - scroll.x
          const w = colSizes[c]! * zoom
          return (
            <div key={c} onPointerDown={(e) => onColDown(e, c)} className={cn('absolute top-0 flex select-none items-center justify-center border-b border-r border-slate-300 text-xs font-medium', wholeCol(c) ? 'bg-emerald-600 text-white' : colSel(c) ? 'bg-emerald-100 text-emerald-800' : 'text-slate-600')} style={{ left, width: w, height: COL_HEADER_H }}>
              {colName(c)}
              <div data-resize onPointerDown={(e) => beginResize(e, 'col', c)} onDoubleClick={() => p.onAutoFit('col', c)} className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-emerald-500/50" />
            </div>
          )
        })}
      </div>
      {/* row headers */}
      <div className="absolute left-0 z-10 overflow-hidden bg-slate-100" style={{ top: COL_HEADER_H, bottom: 0, width: ROW_HEADER_W }}>
        {rowsVis.map((r) => {
          if (rowSizes[r] === 0) return null
          const top = r < sheet.freezeR ? rowOff[r]! : rowOff[r]! - scroll.y
          const h = rowSizes[r]! * zoom
          return (
            <div key={r} onPointerDown={(e) => onRowDown(e, r)} className={cn('absolute left-0 flex select-none items-center justify-center border-b border-r border-slate-300 text-xs font-medium', wholeRow(r) ? 'bg-emerald-600 text-white' : rowSel(r) ? 'bg-emerald-100 text-emerald-800' : 'text-slate-600')} style={{ top, height: h, width: ROW_HEADER_W }}>
              {r + 1}
              <div data-resize onPointerDown={(e) => beginResize(e, 'row', r)} onDoubleClick={() => p.onAutoFit('row', r)} className="absolute -bottom-1 left-0 z-10 h-2 w-full cursor-row-resize hover:bg-emerald-500/50" />
            </div>
          )
        })}
      </div>
      {/* scroller */}
      <div ref={scroller} tabIndex={0} onScroll={onScroll} onPointerDown={onCellDown}
        onDoubleClick={(e) => { const t = e.target as HTMLElement; if (t.closest('[data-fill]') || t.closest('textarea')) return; const h = hit(e.clientX, e.clientY); p.onStartEdit(h.r, h.c) }}
        className="absolute overflow-auto outline-none" style={{ left: ROW_HEADER_W, top: COL_HEADER_H, right: 0, bottom: 0, cursor: p.painterActive ? 'copy' : 'cell' }}>
        <div style={{ position: 'relative', width: totalW, height: totalH }}>
          {cells}
          {/* clipboard ants */}
          {p.clip && <div className="pointer-events-none absolute z-[6] border-2 border-dashed border-emerald-600" style={rectOf(p.clip)} />}
          {/* selection */}
          {ranges.map((g, i) => {
            const rc = rectOf(g)
            const isPrimary = i === 0
            return <div key={i} className="pointer-events-none absolute z-[7]" style={{ ...rc, background: 'rgba(16,185,129,0.12)', border: '2px solid #059669', boxSizing: 'border-box', ...(isPrimary ? {} : {}) }} />
          })}
          {/* active cell */}
          {(() => { const a = rectOf(mergeAt(sheet, sel.anchor.r, sel.anchor.c) ?? { r1: sel.anchor.r, c1: sel.anchor.c, r2: sel.anchor.r, c2: sel.anchor.c }); return <div className="pointer-events-none absolute z-[8]" style={{ ...a, border: '2px solid #047857', boxSizing: 'border-box', background: ed ? undefined : 'transparent' }} /> })()}
          {showHandle && <div data-fill className="absolute z-[9] size-[9px] cursor-crosshair border border-white bg-emerald-700" style={{ left: primRect.left + primRect.width - 5, top: primRect.top + primRect.height - 5 }} />}
          {p.overlay}
          {p.validationItems && !ed && (() => { const a = rectOf(mergeAt(sheet, sel.anchor.r, sel.anchor.c) ?? { r1: sel.anchor.r, c1: sel.anchor.c, r2: sel.anchor.r, c2: sel.anchor.c }); return <ValidationDrop rect={a} items={p.validationItems} onPick={(v) => p.onPickValidation?.(v)} /> })()}
          {fillPreview && <div className="pointer-events-none absolute z-[9] border-2 border-dashed border-emerald-800" style={rectOf(fillPreview)} />}
          {ed && edRect && (
            <textarea
              autoFocus
              value={ed.text}
              spellCheck={false}
              onChange={(e) => p.onEditChange(e.target.value)}
              onKeyDown={p.onEditKey}
              onBlur={p.onEditBlur}
              onFocus={(e) => { const l = e.currentTarget.value.length; e.currentTarget.setSelectionRange(l, l) }}
              className="absolute z-10 resize-none overflow-hidden border-2 border-emerald-700 bg-white px-[3px] outline-none"
              style={{
                left: edRect.left, top: edRect.top, minWidth: edRect.width, minHeight: edRect.height, fieldSizing: 'content',
                fontFamily: `'${edStyle?.font ?? DEFAULT_FONT}', 'Segoe UI', Arial, sans-serif`, fontSize: ((edStyle?.size ?? DEFAULT_SIZE) * 96) / 72 * zoom,
                fontWeight: edStyle?.bold ? 700 : 400, fontStyle: edStyle?.italic ? 'italic' : undefined, lineHeight: 1.25, color: '#111827', whiteSpace: 'pre',
              } as React.CSSProperties}
            />
          )}
        </div>
      </div>
    </div>
  )
}))

function valueAt(calc: Calc, sheet: Sheet, r: number, c: number): V {
  const si = calc.wb.sheets.indexOf(sheet)
  return calc.value(si < 0 ? 0 : si, r, c)
}

function ValidationDrop({ rect, items, onPick }: { rect: { left: number; top: number; width: number; height: number }; items: string[]; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="absolute z-[11]" style={{ left: rect.left + rect.width - 18, top: rect.top + 1 }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="Validation list" onClick={() => setOpen((o) => !o)} className="flex h-[18px] w-[18px] items-center justify-center rounded-sm border border-slate-400 bg-slate-100 text-[9px] text-slate-700">▼</button>
      {open && <div role="listbox" className="absolute right-0 top-5 max-h-48 min-w-28 overflow-auto rounded border border-slate-300 bg-white py-1 text-xs shadow-lg">{items.map((it) => <button key={it} type="button" role="option" onClick={() => { setOpen(false); onPick(it) }} className="block w-full px-3 py-1 text-left hover:bg-emerald-50">{it}</button>)}</div>}
    </div>
  )
}
