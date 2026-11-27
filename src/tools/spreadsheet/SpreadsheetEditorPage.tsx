import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowDownAZ, ArrowUpAZ,
  Bold, Grid2x2 as Borders, ClipboardPaste, Columns3, Copy, Download, Eraser, FilePlus2, Filter, Italic, IndentDecrease, IndentIncrease, Merge, Paintbrush, PaintBucket,
  Percent, Plus, Redo2, Rows3, Save, Scissors, Search, Sigma, Snowflake, Strikethrough, Table2, Type, Underline, Undo2, Upload, WrapText, Eye, Grid3x3,
  ListFilter, Palette, X, FileSpreadsheet, ChevronLeft, ChevronRight, ChartColumn, ChartLine, ChartPie, ChartBar, ListChecks, Hash, CircleDollarSign, Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Grid, type CfResult, type Editing, type GridHandle } from './Grid'
import { Calc, FUNCTION_NAMES, FErr, canonicalizeFormula, shiftFormula, type V } from './formula'
import { NUMBER_FORMATS, formatValue, parseTyped } from './format'
import {
  COL_HEADER_H, DEFAULT_COL_W, DEFAULT_FONT, DEFAULT_ROW_H, DEFAULT_SIZE, MIN_COL_W, MIN_ROW_H, ROW_HEADER_W, cellRef, colName, inRange, key, newSheet, normRange, parseRef, rangeLabel, uid,
  type Border, type BorderStyle, type CellStyle, type ChartDef, type ChartKind, type CondRule, type Range, type RuleType, type Sheet, type Workbook,
} from './model'
import {
  allRanges, applyBorders, clearCells, copyRange, currentRegion, fillSeries, forEachCell, interpretInput, looksLikeHeader, mergeCells, parseTSV, pasteClip, patchStyle, restructure,
  selRange, setRaw, single, sortRange, toTSV, unmergeCells, updateSheet, usedRange, type BorderPreset, type ClipData, type PasteMode, type Sel,
} from './ops'
import { ChartView, buildChartData } from './Charts'
import { exportCsv, exportXlsx, importSpreadsheet } from './xlsxIO'
import { ColorMenu, FontPicker, Menu, MenuItem, MenuTitle, Sep, SizeField, Tb } from '@/tools/presentation/ui'
import { useLocation, useNavigate } from '@/workspace/tabRouter'
import { useTabBridge } from '@/workspace/useTabBridge'
import { isProjectFile, downloadFile, type ProjectFile } from '@/workspace/project'

interface Doc { wb: Workbook; past: Workbook[]; future: Workbook[] }

const newWorkbook = (title: string, sheetName: string): Workbook => ({ title, sheets: [newSheet(sheetName, 200, 26)] })
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export default function SpreadsheetEditorPage() {
  const { t, i18n } = useTranslation()
  const x = (k: string, o?: Record<string, unknown>) => (t as unknown as (k: string, o?: unknown) => string)(`xl.${k}`, o)
  const location = useLocation()
  const navigate = useNavigate()

  const [doc, setDocState] = useState<Doc | null>(null)
  const docRef = useRef<Doc | null>(null)
  const setDoc = (d: Doc | null) => { docRef.current = d; setDocState(d) }
  const [si, setSi] = useState(0)
  const [sel, setSel] = useState<Sel>(single(0, 0))
  const [editing, setEditing] = useState<Editing | null>(null)
  const [clip, setClip] = useState<ClipData | null>(null)
  const [zoom, setZoom] = useState(1)
  const [showFormulas, setShowFormulas] = useState(false)
  const [painter, setPainter] = useState<CellStyle | null>(null)
  const [tab, setTab] = useState<'home' | 'insert' | 'formulas' | 'data' | 'view'>('home')
  const [chartSel, setChartSel] = useState<string | null>(null)
  const tabOrigin = useRef<number | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const [find, setFind] = useState<{ q: string; rep: string; open: boolean; msg: string } | null>(null)
  const [dialog, setDialog] = useState<null | { kind: 'cf' } | { kind: 'prompt'; title: string; value: string; onOk: (v: string) => void } | { kind: 'filter'; col: number; x: number; y: number } | { kind: 'validation' } | { kind: 'pivot' }>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [tabMenu, setTabMenu] = useState<{ i: number; x: number; y: number } | null>(null)
  const [nameBox, setNameBox] = useState<string | null>(null)

  const grid = useRef<GridHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lastGesture = useRef<{ key: string; at: number } | null>(null)
  const resizeBase = useRef<Workbook | null>(null)

  const wb = doc?.wb ?? null
  const sheet = wb?.sheets[si] ?? null
  const calc = useMemo(() => (wb ? new Calc(wb) : null), [wb])

  // ── history ────────────────────────────────────────────────────────────────
  const commit = (fn: (w: Workbook) => Workbook, gesture?: string) => {
    const d = docRef.current
    if (!d) return
    const next = fn(d.wb)
    if (next === d.wb) return
    const now = Date.now()
    const co = !!gesture && lastGesture.current?.key === gesture && now - lastGesture.current.at < 1000
    lastGesture.current = gesture ? { key: gesture, at: now } : null
    setDoc({ wb: next, past: co ? d.past : [...d.past.slice(-60), d.wb], future: [] })
  }
  const edit = (fn: (s: Sheet) => Sheet, gesture?: string) => commit((w) => updateSheet(w, si, fn), gesture)
  const undo = () => {
    const d = docRef.current
    if (!d || !d.past.length) return
    lastGesture.current = null
    const prev = d.past[d.past.length - 1]!
    setDoc({ wb: prev, past: d.past.slice(0, -1), future: [d.wb, ...d.future] })
    setSi((i) => Math.min(i, prev.sheets.length - 1))
    setEditing(null)
  }
  const redo = () => {
    const d = docRef.current
    if (!d || !d.future.length) return
    lastGesture.current = null
    const nx = d.future[0]!
    setDoc({ wb: nx, past: [...d.past, d.wb], future: d.future.slice(1) })
    setSi((i) => Math.min(i, nx.sheets.length - 1))
    setEditing(null)
  }

  // ── loading / project ──────────────────────────────────────────────────────
  const { saveProject, openProjectFile } = useTabBridge({
    hasContent: doc !== null,
    title: wb?.title,
    getProject: (): ProjectFile => ({ app: 'edavio', version: 1, kind: 'spreadsheet', title: docRef.current!.wb.title, savedAt: new Date().toISOString(), data: { wb: docRef.current!.wb, si } }),
  })

  const load = (w: Workbook, active = 0) => {
    setDoc({ wb: w, past: [], future: [] })
    setSi(active)
    setSel(single(0, 0))
    setEditing(null)
    setClip(null)
  }
  const openFile = async (file: File) => {
    if (isProjectFile(file)) {
      try { await openProjectFile(file) } catch { setError(x('loadError')) }
      return
    }
    setBusy(true)
    setError(null)
    try { load(await importSpreadsheet(file)) } catch (e) { console.error(e); setError(x('loadError')) } finally { setBusy(false) }
  }
  const blank = () => load(newWorkbook(x('untitled'), x('sheetName', { n: 1 })))

  useEffect(() => {
    const st = location.state
    if (st?.project) {
      const d = st.project.data as { wb: Workbook; si: number }
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => load(d.wb, d.si))
    } else if (st?.file) {
      const f = st.file
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => void openFile(f))
    } else if (st?.newBlank) {
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(blank)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(id)
  }, [notice])

  // ── geometry ───────────────────────────────────────────────────────────────
  const filterHidden = useMemo(() => {
    const out = new Set<number>()
    const f = sheet?.filter
    if (!f || !calc || !sheet) return out
    for (let r = f.range.r1 + 1; r <= f.range.r2; r++) {
      for (const [col, allowed] of Object.entries(f.allowed)) {
        const c = Number(col)
        const txt = formatValue(calc.value(si, r, c), sheet.cells[key(r, c)]?.s?.fmt).text
        if (!allowed.includes(txt)) { out.add(r); break }
      }
    }
    return out
  }, [sheet, calc, si])

  const rowSizes = useMemo(() => (sheet ? Array.from({ length: sheet.rows }, (_, r) => (sheet.hiddenRows.includes(r) || filterHidden.has(r) ? 0 : sheet.rowH[r] ?? DEFAULT_ROW_H)) : []), [sheet, filterHidden])
  const colSizes = useMemo(() => (sheet ? Array.from({ length: sheet.cols }, (_, c) => (sheet.hiddenCols.includes(c) ? 0 : sheet.colW[c] ?? DEFAULT_COL_W)) : []), [sheet])

  // ── conditional formatting ─────────────────────────────────────────────────
  const ruleStats = useMemo(() => {
    const m = new Map<string, { min: number; max: number; dup: Set<string> }>()
    if (!sheet || !calc) return m
    for (const rule of sheet.rules) {
      if (rule.type !== 'scale' && rule.type !== 'bar' && rule.type !== 'dup') continue
      let min = Infinity, max = -Infinity
      const seen = new Map<string, number>()
      forEachCell([rule.range], (r, c) => {
        const v = calc.value(si, r, c)
        if (typeof v === 'number') { min = Math.min(min, v); max = Math.max(max, v) }
        if (v !== null && v !== '') seen.set(String(v), (seen.get(String(v)) ?? 0) + 1)
      })
      m.set(rule.id, { min, max, dup: new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k)) })
    }
    return m
  }, [sheet, calc, si])

  const cf = (r: number, c: number, v: V): CfResult | null => {
    if (!sheet?.rules.length) return null
    let out: CfResult | null = null
    for (const rule of sheet.rules) {
      if (!inRange(rule.range, r, c)) continue
      const a = rule.a !== undefined && rule.a !== '' ? (calc ? numOrText(rule.a) : rule.a) : undefined
      const b = rule.b !== undefined && rule.b !== '' ? numOrText(rule.b) : undefined
      const n = typeof v === 'number' ? v : undefined
      let hitRule = false
      switch (rule.type) {
        case 'gt': hitRule = n !== undefined && typeof a === 'number' && n > a; break
        case 'lt': hitRule = n !== undefined && typeof a === 'number' && n < a; break
        case 'eq': hitRule = a !== undefined && (typeof a === 'number' ? n === a : String(v ?? '').toLowerCase() === String(a).toLowerCase()); break
        case 'neq': hitRule = a !== undefined && (typeof a === 'number' ? n !== a : String(v ?? '').toLowerCase() !== String(a).toLowerCase()); break
        case 'between': hitRule = n !== undefined && typeof a === 'number' && typeof b === 'number' && n >= Math.min(a, b) && n <= Math.max(a, b); break
        case 'contains': hitRule = a !== undefined && String(v ?? '').toLowerCase().includes(String(a).toLowerCase()); break
        case 'blank': hitRule = v === null || v === ''; break
        case 'dup': hitRule = v !== null && v !== '' && !!ruleStats.get(rule.id)?.dup.has(String(v)); break
        case 'scale': case 'bar': {
          const st = ruleStats.get(rule.id)
          if (n !== undefined && st && st.max > st.min) {
            const p = (n - st.min) / (st.max - st.min)
            if (rule.type === 'bar') out = { ...(out ?? {}), bar: p, barColor: rule.bg ?? '#60a5fa' }
            else out = { ...(out ?? {}), bg: mix(rule.bg ?? '#22c55e', '#ffffff', p) }
          }
          continue
        }
      }
      if (hitRule) out = { ...out, bg: rule.bg ?? out?.bg, color: rule.color ?? out?.color, bold: rule.bold ?? out?.bold }
    }
    return out
  }

  // ── selection helpers ──────────────────────────────────────────────────────
  const prim = selRange(sel)
  const active = sel.anchor
  const activeCell = sheet?.cells[key(active.r, active.c)]
  const activeStyle: CellStyle = activeCell?.s ?? {}
  const ranges = allRanges(sel)

  const reveal = (r: number, c: number) => requestAnimationFrame(() => grid.current?.reveal(r, c))
  const moveTo = (r: number, c: number, extend = false) => {
    if (!sheet) return
    const rr = clamp(r, 0, sheet.rows - 1), cc = clamp(c, 0, sheet.cols - 1)
    setSel(extend ? { ...sel, focus: { r: rr, c: cc } } : single(rr, cc))
    reveal(rr, cc)
  }

  const growSheet = (axis: 'rows' | 'cols') => {
    const d = docRef.current
    if (!d) return
    const cur = d.wb.sheets[si]
    if (!cur) return
    if (axis === 'rows' && cur.rows >= 5000) return
    if (axis === 'cols' && cur.cols >= 200) return
    setDoc({ ...d, wb: updateSheet(d.wb, si, (s) => ({ ...s, rows: axis === 'rows' ? s.rows + 100 : s.rows, cols: axis === 'cols' ? s.cols + 10 : s.cols })) })
  }

  // ── editing ────────────────────────────────────────────────────────────────
  const rawOf = (r: number, c: number) => sheet?.cells[key(r, c)]?.v ?? ''
  const displayRaw = (r: number, c: number) => { const v = rawOf(r, c); return v[0] === "'" ? v.slice(1) : v }

  const startEdit = (r: number, c: number, text?: string) => {
    if (!sheet) return
    const m = sheet.merges.find((g) => inRange(g, r, c))
    const rr = m ? m.r1 : r, cc = m ? m.c1 : c
    setSel((s) => (s.anchor.r === rr && s.anchor.c === cc ? s : single(rr, cc)))
    setEditing({ r: rr, c: cc, text: text ?? displayRaw(rr, cc), mode: text !== undefined ? 'enter' : 'edit' })
  }

  const validationAt = (r: number, c: number) => sheet?.validations?.find((v) => inRange(v.range, r, c))
  const writeCell = (r: number, c: number, text: string) => {
    const val = validationAt(r, c)
    if (val && text !== '') {
      const num = Number(text.replace(',', '.'))
      const bad =
        (val.type === 'list' && !(val.items ?? []).some((i) => i.toLowerCase() === text.toLowerCase())) ||
        (val.type !== 'list' && (!Number.isFinite(num) || (val.type === 'whole' && !Number.isInteger(num)) || (val.min !== undefined && num < val.min) || (val.max !== undefined && num > val.max)))
      if (bad) { setNotice(x('invalidValue')); return }
    }
    const existingFmt = sheet?.cells[key(r, c)]?.s?.fmt
    const out = interpretInput(text, existingFmt)
    const raw = out.raw[0] === '=' ? canonicalizeFormula(out.raw) : out.raw
    edit((s) => setRaw(s, r, c, raw, out.fmt ? { fmt: out.fmt } : undefined))
  }

  const commitEdit = (move: 'down' | 'up' | 'right' | 'left' | 'none') => {
    const e = editing
    if (!e || !sheet) return
    setEditing(null)
    writeCell(e.r, e.c, e.text)
    if (move === 'none') return
    if (move !== 'right' && move !== 'left' && move !== 'down') tabOrigin.current = null
    const g = prim
    const multi = g.r1 !== g.r2 || g.c1 !== g.c2
    let r = e.r, c = e.c
    if (multi) {
      // cycle inside the selection
      if (move === 'down' || move === 'up') { r += move === 'down' ? 1 : -1; if (r > g.r2 || r < g.r1) { r = move === 'down' ? g.r1 : g.r2; c = c + (move === 'down' ? 1 : -1); if (c > g.c2) c = g.c1; if (c < g.c1) c = g.c2 } }
      else { c += move === 'right' ? 1 : -1; if (c > g.c2 || c < g.c1) { c = move === 'right' ? g.c1 : g.c2; r = r + (move === 'right' ? 1 : -1); if (r > g.r2) r = g.r1; if (r < g.r1) r = g.r2 } }
      setSel({ ...sel, anchor: { r, c }, focus: sel.focus })
      reveal(r, c)
      return
    }
    if (move === 'right' || move === 'left') tabOrigin.current ??= e.c
    if (move === 'down') { r++; if (tabOrigin.current !== null) c = tabOrigin.current; tabOrigin.current = null }
    else if (move === 'up') r--
    else if (move === 'right') c++
    else c--
    moveTo(r, c)
  }

  const onEditKey = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const e = editing
    if (!e) return
    if (ev.key === 'Enter') {
      if (ev.altKey) { ev.preventDefault(); const el = ev.currentTarget; const s = el.selectionStart; setEditing({ ...e, text: e.text.slice(0, s) + '\n' + e.text.slice(el.selectionEnd) }); return }
      ev.preventDefault(); commitEdit(ev.shiftKey ? 'up' : 'down')
    } else if (ev.key === 'Tab') { ev.preventDefault(); commitEdit(ev.shiftKey ? 'left' : 'right') }
    else if (ev.key === 'Escape') { ev.preventDefault(); setEditing(null); scrollerFocus() }
    else if (e.mode === 'enter' && ev.key.startsWith('Arrow') && !ev.shiftKey) {
      ev.preventDefault()
      commitEdit(ev.key === 'ArrowDown' ? 'down' : ev.key === 'ArrowUp' ? 'up' : ev.key === 'ArrowLeft' ? 'left' : 'right')
    } else if (ev.key === 'F2') { ev.preventDefault(); setEditing({ ...e, mode: e.mode === 'enter' ? 'edit' : 'enter' }) }
  }
  const scrollerFocus = () => requestAnimationFrame(() => (document.querySelector('[data-xl-root] [tabindex="0"]') as HTMLElement | null)?.focus())

  /** clicking a cell while typing a formula inserts its reference */
  const onPoint = (r: number, c: number): boolean => {
    const e = editing
    if (!e || e.text[0] !== '=' || !/[=(+\-*/^&,;<>:]$/.test(e.text)) return false
    setEditing({ ...e, text: e.text + cellRef(r, c) })
    return true
  }

  // ── style / format commands ────────────────────────────────────────────────
  const styleRanges = (): Range[] => ranges
  const applyStyle = (fn: (s: CellStyle) => CellStyle) => edit((s) => patchStyle(s, styleRanges(), fn))
  const toggle = (k: 'bold' | 'italic' | 'underline' | 'strike') => { const on = !activeStyle[k]; applyStyle((s) => ({ ...s, [k]: on || undefined })) }
  const setFmt = (code: string | undefined) => applyStyle((s) => ({ ...s, fmt: code && code !== 'General' ? code : undefined }))
  const decimals = (d: 1 | -1) => {
    const cur = activeStyle.fmt ?? 'General'
    let code = cur
    if (cur === 'General') code = d > 0 ? '0.0' : '0'
    else {
      const m = cur.match(/0(?:\.(0+))?/)
      if (!m) return
      const n = (m[1]?.length ?? 0) + d
      if (n < 0) return
      code = cur.replace(/0(?:\.0+)?/, n ? '0.' + '0'.repeat(n) : '0')
    }
    setFmt(code)
  }
  const borders = (preset: BorderPreset, style: BorderStyle, color: string) => edit((s) => applyBorders(s, ranges, preset, { style, color } as Border))
  const merge = (kind: 'merge' | 'center' | 'unmerge') => edit((s) => {
    let out = s
    for (const g of ranges) {
      if (kind === 'unmerge') out = unmergeCells(out, g)
      else { out = mergeCells(out, g); if (kind === 'center') out = patchStyle(out, [g], (st) => ({ ...st, h: 'center' })) }
    }
    return out
  })

  // ── clipboard ──────────────────────────────────────────────────────────────
  const valueOf = (r: number, c: number): V => (calc ? calc.value(si, r, c) : null)
  const tsvOf = (g: Range) => {
    const rows: string[][] = []
    for (let r = g.r1; r <= g.r2; r++) { const row: string[] = []; for (let c = g.c1; c <= g.c2; c++) row.push(formatValue(valueOf(r, c), sheet?.cells[key(r, c)]?.s?.fmt).text.replace(/ /g, ' ')); rows.push(row) }
    return toTSV(rows)
  }
  const doCopy = (cut: boolean, ev?: ClipboardEvent) => {
    if (!sheet) return
    const g = prim
    setClip(copyRange(sheet, g, cut))
    const text = tsvOf(g)
    if (ev?.clipboardData) { ev.clipboardData.setData('text/plain', text); ev.preventDefault() }
    else void navigator.clipboard?.writeText(text).catch(() => undefined)
  }
  const doPaste = (mode: PasteMode = 'all', text?: string) => {
    if (!sheet) return
    const at = { r: prim.r1, c: prim.c1 }
    if (clip && (text === undefined || text === tsvOfClip(clip))) {
      commit((w) => pasteClip(w, si, at, clip, mode, (r, c) => calc?.value(si, r, c) ?? null))
      if (clip.cut) setClip(null)
      const rows = clip.cells.length, cols = clip.cells[0]?.length ?? 0
      setSel({ anchor: at, focus: { r: at.r + (mode === 'transpose' ? cols : rows) - 1, c: at.c + (mode === 'transpose' ? rows : cols) - 1 }, extra: [] })
      return
    }
    if (text === undefined) { void navigator.clipboard?.readText().then((tx) => tx && doPaste(mode, tx)).catch(() => setNotice(x('pasteBlocked'))); return }
    const rows = parseTSV(text)
    edit((s) => {
      let out = s
      rows.forEach((row, i) => row.forEach((cell, j) => {
        const ent = interpretInput(cell, out.cells[key(at.r + i, at.c + j)]?.s?.fmt)
        out = setRaw(out, at.r + i, at.c + j, ent.raw[0] === '=' ? canonicalizeFormula(ent.raw) : ent.raw, ent.fmt ? { fmt: ent.fmt } : undefined)
      }))
      return { ...out, rows: Math.max(out.rows, at.r + rows.length + 5), cols: Math.max(out.cols, at.c + Math.max(...rows.map((r) => r.length)) + 2) }
    })
    setSel({ anchor: at, focus: { r: at.r + rows.length - 1, c: at.c + Math.max(...rows.map((r) => r.length)) - 1 }, extra: [] })
  }
  const tsvOfClip = (c: ClipData) => toTSV(c.cells.map((row) => row.map((cell) => (cell ? (cell.v[0] === '=' ? '' : cell.v) : ''))))
  void tsvOfClip

  // ── structure ──────────────────────────────────────────────────────────────
  const insertRows = (after: boolean) => { const g = prim; const n = g.r2 - g.r1 + 1; commit((w) => restructure(w, si, 'row', after ? g.r2 + 1 : g.r1, n)) }
  const insertCols = (after: boolean) => { const g = prim; const n = g.c2 - g.c1 + 1; commit((w) => restructure(w, si, 'col', after ? g.c2 + 1 : g.c1, n)) }
  const deleteRows = () => { const g = prim; commit((w) => restructure(w, si, 'row', g.r1, -(g.r2 - g.r1 + 1))); setSel(single(Math.min(g.r1, (sheet?.rows ?? 1) - 1), g.c1)) }
  const deleteCols = () => { const g = prim; commit((w) => restructure(w, si, 'col', g.c1, -(g.c2 - g.c1 + 1))); setSel(single(g.r1, Math.min(g.c1, (sheet?.cols ?? 1) - 1))) }
  const hide = (axis: 'row' | 'col', on: boolean) => {
    const g = prim
    edit((s) => {
      const idx = axis === 'row' ? range(g.r1, g.r2) : range(g.c1, g.c2)
      if (axis === 'row') return { ...s, hiddenRows: on ? [...new Set([...s.hiddenRows, ...idx])] : s.hiddenRows.filter((i) => !(i >= g.r1 - 1 && i <= g.r2 + 1)) }
      return { ...s, hiddenCols: on ? [...new Set([...s.hiddenCols, ...idx])] : s.hiddenCols.filter((i) => !(i >= g.c1 - 1 && i <= g.c2 + 1)) }
    })
  }

  const setSize = (axis: 'row' | 'col', index: number, size: number, phase: 'start' | 'move' | 'end') => {
    const d = docRef.current
    if (!d || !sheet) return
    if (phase === 'start') { resizeBase.current = d.wb; return }
    if (phase === 'end') {
      const base = resizeBase.current
      resizeBase.current = null
      if (base && base !== d.wb) setDoc({ ...d, past: [...d.past.slice(-60), base], future: [] })
      return
    }
    const g = prim
    const whole = axis === 'col' ? g.c1 <= index && g.c2 >= index && g.r1 === 0 && g.r2 >= sheet.rows - 1 : g.r1 <= index && g.r2 >= index && g.c1 === 0 && g.c2 >= sheet.cols - 1
    const targets = whole ? (axis === 'col' ? range(g.c1, g.c2) : range(g.r1, g.r2)) : [index]
    const sz = Math.round(Math.max(axis === 'col' ? MIN_COL_W : MIN_ROW_H, size))
    setDoc({
      ...d,
      wb: updateSheet(d.wb, si, (s) => {
        const map = { ...(axis === 'col' ? s.colW : s.rowH) }
        for (const i of targets) map[i] = sz
        return axis === 'col' ? { ...s, colW: map } : { ...s, rowH: map }
      }),
    })
  }

  const autoFit = (axis: 'row' | 'col', index: number) => {
    if (!sheet) return
    const ctx2 = document.createElement('canvas').getContext('2d')!
    let best = axis === 'col' ? MIN_COL_W : DEFAULT_ROW_H
    for (const [k, cell] of Object.entries(sheet.cells)) {
      const [r, c] = k.split(',').map(Number) as [number, number]
      if ((axis === 'col' ? c : r) !== index || cell.v === '') continue
      const s = cell.s
      ctx2.font = `${s?.italic ? 'italic ' : ''}${s?.bold ? 'bold ' : ''}${((s?.size ?? DEFAULT_SIZE) * 96) / 72}px '${s?.font ?? DEFAULT_FONT}', Arial`
      const txt = formatValue(valueOf(r, c), s?.fmt).text
      if (axis === 'col') best = Math.max(best, Math.ceil(ctx2.measureText(txt).width) + 12)
      else best = Math.max(best, Math.ceil(((s?.size ?? DEFAULT_SIZE) * 96) / 72 * 1.4) + 6)
    }
    const g = prim
    const whole = axis === 'col' ? g.c1 <= index && g.c2 >= index : g.r1 <= index && g.r2 >= index
    const targets = whole && (axis === 'col' ? g.r2 - g.r1 >= sheet.rows - 1 : g.c2 - g.c1 >= sheet.cols - 1) ? (axis === 'col' ? range(g.c1, g.c2) : range(g.r1, g.r2)) : [index]
    if (axis === 'row') { edit((s) => ({ ...s, rowH: { ...s.rowH, ...Object.fromEntries(targets.map((i) => [i, best])) } })); return }
    edit((s) => {
      const map = { ...s.colW }
      for (const i of targets) {
        let w = MIN_COL_W
        for (const [k, cell] of Object.entries(s.cells)) {
          const [r, c] = k.split(',').map(Number) as [number, number]
          if (c !== i || cell.v === '') continue
          const st = cell.s
          ctx2.font = `${st?.italic ? 'italic ' : ''}${st?.bold ? 'bold ' : ''}${((st?.size ?? DEFAULT_SIZE) * 96) / 72}px '${st?.font ?? DEFAULT_FONT}', Arial`
          w = Math.max(w, Math.ceil(ctx2.measureText(formatValue(valueOf(r, c), st?.fmt).text).width) + 12)
        }
        map[i] = w
      }
      return { ...s, colW: map }
    })
  }

  // ── fill / sort / filter / find ────────────────────────────────────────────
  const doFill = (src: Range, dst: Range) => {
    edit((s) => fillSeries(s, src, dst))
    setSel({ anchor: { r: Math.min(src.r1, dst.r1), c: Math.min(src.c1, dst.c1) }, focus: { r: Math.max(src.r2, dst.r2), c: Math.max(src.c2, dst.c2) }, extra: [] })
  }
  const fillDir = (dir: 'down' | 'right') => {
    const g = prim
    if (dir === 'down' && g.r2 > g.r1) edit((s) => fillSeries(s, { ...g, r2: g.r1 }, g))
    if (dir === 'right' && g.c2 > g.c1) edit((s) => fillSeries(s, { ...g, c2: g.c1 }, g))
  }

  const regionOf = (): Range => {
    const g = prim
    if (!sheet) return g
    return g.r1 === g.r2 && g.c1 === g.c2 ? currentRegion(sheet, g.r1, g.c1) : g
  }
  const doSort = (asc: boolean) => {
    if (!sheet) return
    const g = regionOf()
    const col = clamp(active.c, g.c1, g.c2)
    const header = looksLikeHeader(g, valueOf)
    edit((s) => sortRange(s, g, col, asc, valueOf, header))
    setSel({ anchor: { r: g.r1, c: g.c1 }, focus: { r: g.r2, c: g.c2 }, extra: [] })
  }
  const toggleFilter = () => {
    if (!sheet) return
    if (sheet.filter) { edit((s) => ({ ...s, filter: undefined })); return }
    const g = regionOf()
    edit((s) => ({ ...s, filter: { range: g, allowed: {} } }))
  }
  const removeDuplicates = () => {
    if (!sheet) return
    const g = regionOf()
    const header = looksLikeHeader(g, valueOf)
    const seen = new Set<string>()
    const keep: number[] = []
    for (let r = header ? g.r1 + 1 : g.r1; r <= g.r2; r++) {
      const id = range(g.c1, g.c2).map((c) => String(valueOf(r, c) ?? '')).join('\u0001')
      if (!seen.has(id)) { seen.add(id); keep.push(r) }
    }
    const start = header ? g.r1 + 1 : g.r1
    edit((s) => {
      const cells = { ...s.cells }
      for (let r = start; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) delete cells[key(r, c)]
      keep.forEach((srcR, i) => { for (let c = g.c1; c <= g.c2; c++) { const cell = s.cells[key(srcR, c)]; if (cell) cells[key(start + i, c)] = cell } })
      return { ...s, cells }
    })
    setNotice(x('dupRemoved', { n: g.r2 - start + 1 - keep.length }))
  }

  const runFind = (dir: 1 | -1, replace?: 'one' | 'all') => {
    if (!sheet || !find || !find.q) return
    const q = find.q.toLowerCase()
    const matches: { r: number; c: number }[] = []
    for (const k of Object.keys(sheet.cells)) {
      const [r, c] = k.split(',').map(Number) as [number, number]
      const shown = formatValue(valueOf(r, c), sheet.cells[k]!.s?.fmt).text.toLowerCase()
      if (shown.includes(q) || sheet.cells[k]!.v.toLowerCase().includes(q)) matches.push({ r, c })
    }
    matches.sort((a, b) => a.r - b.r || a.c - b.c)
    if (!matches.length) { setFind({ ...find, msg: x('notFound') }); return }
    if (replace === 'all') {
      const re = new RegExp(find.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      edit((s) => { let out = s; for (const m of matches) { const raw = out.cells[key(m.r, m.c)]!.v; out = setRaw(out, m.r, m.c, raw.replace(re, find.rep)) } return out })
      setFind({ ...find, msg: x('replaced', { n: matches.length }) })
      return
    }
    const cur = matches.findIndex((m) => m.r > active.r || (m.r === active.r && m.c > active.c))
    const curBack = [...matches].reverse().findIndex((m) => m.r < active.r || (m.r === active.r && m.c < active.c))
    let target = dir === 1 ? matches[cur < 0 ? 0 : cur]! : matches[curBack < 0 ? matches.length - 1 : matches.length - 1 - curBack]!
    if (replace === 'one') {
      const here = matches.find((m) => m.r === active.r && m.c === active.c)
      if (here) {
        const re = new RegExp(find.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        edit((s) => setRaw(s, here.r, here.c, s.cells[key(here.r, here.c)]!.v.replace(re, find.rep)))
      }
      target = matches[cur < 0 ? 0 : cur]!
    }
    setFind({ ...find, msg: `${matches.length} ${x('found')}` })
    moveTo(target.r, target.c)
  }

  // ── formulas ───────────────────────────────────────────────────────────────
  const autoSum = (fn = 'SUM') => {
    if (!sheet) return
    const g = prim
    const single1 = g.r1 === g.r2 && g.c1 === g.c2
    if (!single1) {
      // put totals under (or right of) the selection
      const tall = g.r2 - g.r1 >= g.c2 - g.c1 || true
      void tall
      edit((s) => {
        let out = s
        for (let c = g.c1; c <= g.c2; c++) out = setRaw(out, g.r2 + 1, c, `=${fn}(${cellRef(g.r1, c)}:${cellRef(g.r2, c)})`)
        return out
      })
      return
    }
    // single cell: sum the numbers above, else to the left
    let r = g.r1 - 1
    while (r >= 0 && typeof valueOf(r, g.c1) === 'number') r--
    if (r < g.r1 - 1) { edit((s) => setRaw(s, g.r1, g.c1, `=${fn}(${cellRef(r + 1, g.c1)}:${cellRef(g.r1 - 1, g.c1)})`)); return }
    let c = g.c1 - 1
    while (c >= 0 && typeof valueOf(g.r1, c) === 'number') c--
    if (c < g.c1 - 1) { edit((s) => setRaw(s, g.r1, g.c1, `=${fn}(${cellRef(g.r1, c + 1)}:${cellRef(g.r1, g.c1 - 1)})`)); return }
    setEditing({ r: g.r1, c: g.c1, text: `=${fn}(`, mode: 'edit' })
  }
  const insertFn = (name: string) => {
    const g = prim
    setEditing({ r: active.r, c: active.c, text: `=${name}(`, mode: 'edit' })
    setSel(single(active.r, active.c))
    void g
  }

  // ── charts / pivot ─────────────────────────────────────────────────────────
  const addChart = (kind: ChartKind) => {
    if (!sheet) return
    const g = regionOf()
    if (g.c2 === g.c1 && g.r2 === g.r1) { setNotice(x('chartNeedData')); return }
    const def: ChartDef = { id: uid(), kind, range: g, title: x('chartTitle'), x: colSizes.slice(0, g.c2 + 1).reduce((a, b) => a + b, 0) + 24, y: Math.max(8, rowSizes.slice(0, g.r1).reduce((a, b) => a + b, 0)), w: 420, h: 280 }
    edit((s) => ({ ...s, charts: [...(s.charts ?? []), def] }))
    setChartSel(def.id)
  }
  const patchChart = (id: string, p: Partial<ChartDef>) => {
    const d = docRef.current
    if (!d) return
    setDoc({ ...d, wb: updateSheet(d.wb, si, (s) => ({ ...s, charts: (s.charts ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)) })) })
  }
  const createPivot = (o: { row: number; col: number | null; val: number; agg: 'SUM' | 'COUNT' | 'AVERAGE' }) => {
    if (!sheet) return
    const g = regionOf()
    const hdr = looksLikeHeader(g, valueOf) ? g.r1 + 1 : g.r1
    const colRange = (c: number) => `${sheetRef(sheet.name)}!$${colName(c)}$${hdr + 1}:$${colName(c)}$${g.r2 + 1}`
    const uniq = (c: number) => [...new Set(range(hdr, g.r2).map((r) => String(valueOf(r, c) ?? '')))].filter((v) => v !== '').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const rows = uniq(o.row), cols = o.col === null ? [] : uniq(o.col)
    const target = newSheet(x('pivotName'), Math.max(50, rows.length + 5), Math.max(10, cols.length + 4))
    const bold = { bold: true, bg: '#e8f3ec' }
    const put = (r: number, c: number, v: string, st?: CellStyle) => { target.cells[key(r, c)] = { v, s: st } }
    const aggFn = (rowCell: string, colCell?: string) => {
      const base = [`${colRange(o.row)},${rowCell}`, colCell ? `${colRange(o.col!)},${colCell}` : ''].filter(Boolean).join(',')
      if (o.agg === 'COUNT') return `=COUNTIFS(${base})`
      if (o.agg === 'AVERAGE') return `=AVERAGEIFS(${colRange(o.val)},${base})`
      return `=SUMIFS(${colRange(o.val)},${base})`
    }
    put(0, 0, String(valueOf(g.r1, o.row) ?? ''), bold)
    if (o.col === null) {
      put(0, 1, `${x(`agg_${o.agg}`)} ${valueOf(g.r1, o.val) ?? ''}`, bold)
      rows.forEach((rv, i) => { put(i + 1, 0, rv); put(i + 1, 1, aggFn(`$A${i + 2}`)) })
      put(rows.length + 1, 0, x('total'), bold)
      put(rows.length + 1, 1, `=SUM(B2:B${rows.length + 1})`, bold)
    } else {
      cols.forEach((cv, j) => put(0, j + 1, cv, bold))
      put(0, cols.length + 1, x('total'), bold)
      rows.forEach((rv, i) => {
        put(i + 1, 0, rv)
        cols.forEach((_cv, j) => put(i + 1, j + 1, aggFn(`$A${i + 2}`, `${colName(j + 1)}$1`)))
        put(i + 1, cols.length + 1, `=SUM(B${i + 2}:${colName(cols.length)}${i + 2})`, bold)
      })
      put(rows.length + 1, 0, x('total'), bold)
      for (let j = 0; j <= cols.length; j++) put(rows.length + 1, j + 1, `=SUM(${colName(j + 1)}2:${colName(j + 1)}${rows.length + 1})`, bold)
    }
    target.colW = { 0: 140 }
    commit((w) => ({ ...w, sheets: [...w.sheets, target] }))
    setSi(docRef.current!.wb.sheets.length - 1)
    setSel(single(0, 0))
  }

  // ── sheets ─────────────────────────────────────────────────────────────────
  const addSheet = () => {
    commit((w) => {
      let n = w.sheets.length + 1
      while (w.sheets.some((s) => s.name === x('sheetName', { n }))) n++
      return { ...w, sheets: [...w.sheets, newSheet(x('sheetName', { n }), 200, 26)] }
    })
    setSi(docRef.current!.wb.sheets.length - 1)
    setSel(single(0, 0))
  }
  const renameSheet = (i: number, name: string) => {
    const n = name.trim().slice(0, 31).replace(/[\\/?*[\]:]/g, '')
    if (!n || !wb || wb.sheets.some((s, j) => j !== i && s.name.toLowerCase() === n.toLowerCase())) return
    commit((w) => {
      const old = w.sheets[i]!.name
      const fixRef = (f: string) => f.replace(new RegExp(`(^|[^\\w.'])'?${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?!`, 'g'), (_m, p: string) => `${p}${/^[A-Za-z_][\w.]*$/.test(n) ? n : `'${n}'`}!`)
      return { ...w, sheets: w.sheets.map((s, j) => ({ ...s, name: j === i ? n : s.name, cells: Object.fromEntries(Object.entries(s.cells).map(([k, c]) => [k, c.v[0] === '=' ? { ...c, v: fixRef(c.v) } : c])) })) }
    })
  }
  const deleteSheet = (i: number) => {
    if (!wb || wb.sheets.length < 2) return
    commit((w) => ({ ...w, sheets: w.sheets.filter((_, j) => j !== i) }))
    setSi((cur) => clamp(cur > i ? cur - 1 : cur, 0, wb.sheets.length - 2))
  }
  const duplicateSheet = (i: number) => {
    if (!wb) return
    commit((w) => { const s = w.sheets[i]!; const copy = { ...s, id: uid(), name: `${s.name} (2)`.slice(0, 31) }; return { ...w, sheets: [...w.sheets.slice(0, i + 1), copy, ...w.sheets.slice(i + 1)] } })
    setSi(i + 1)
  }
  const moveSheet = (i: number, d: number) => {
    if (!wb || i + d < 0 || i + d >= wb.sheets.length) return
    commit((w) => { const a = [...w.sheets]; const [m] = a.splice(i, 1); a.splice(i + d, 0, m!); return { ...w, sheets: a } })
    setSi(i + d)
  }

  // ── export ─────────────────────────────────────────────────────────────────
  const doExport = async (kind: 'xlsx' | 'csv') => {
    if (!wb || !sheet) return
    setBusy(true)
    try {
      const name = (wb.title || x('untitled')).trim()
      if (kind === 'xlsx') downloadFile(await exportXlsx(wb), `${name}.xlsx`)
      else downloadFile(exportCsv(sheet, wb, si, (v, f) => formatValue(v, f).text.replace(/ /g, '')), `${name}.csv`)
      setNotice(x('exported'))
    } catch (e) { console.error(e); setError(x('exportError')) } finally { setBusy(false) }
  }

  // ── global keyboard / clipboard events ─────────────────────────────────────
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined)
  keyRef.current = (e: KeyboardEvent) => {
    if (!docRef.current || !sheet) return
    const tgt = e.target as HTMLElement
    if (!document.querySelector('[data-xl-root]')?.contains(tgt) && tgt !== document.body) return
    if (document.querySelector('[data-xl-root]')?.parentElement?.classList.contains('hidden')) return
    if (editing) return
    if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT') return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key
    const lk = k.toLowerCase()
    if (mod && lk === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
    if (mod && lk === 'y') { e.preventDefault(); redo(); return }
    if (mod && lk === 'a') { e.preventDefault(); setSel(prim.r1 === 0 && prim.c1 === 0 && prim.r2 >= sheet.rows - 1 ? single(active.r, active.c) : (prim.r1 !== prim.r2 || prim.c1 !== prim.c2 ? { anchor: { r: 0, c: 0 }, focus: { r: sheet.rows - 1, c: sheet.cols - 1 }, extra: [] } : (() => { const g = currentRegion(sheet, active.r, active.c); return { anchor: { r: g.r1, c: g.c1 }, focus: { r: g.r2, c: g.c2 }, extra: [] } })())); return }
    if (mod && lk === 'b') { e.preventDefault(); toggle('bold'); return }
    if (mod && lk === 'i') { e.preventDefault(); toggle('italic'); return }
    if (mod && lk === 'u') { e.preventDefault(); toggle('underline'); return }
    if (mod && lk === 'd') { e.preventDefault(); fillDir('down'); return }
    if (mod && lk === 'r') { e.preventDefault(); fillDir('right'); return }
    if (mod && lk === 'f') { e.preventDefault(); setFind((f) => ({ q: f?.q ?? '', rep: f?.rep ?? '', open: true, msg: '' })); return }
    if (mod && lk === 'h') { e.preventDefault(); setFind((f) => ({ q: f?.q ?? '', rep: f?.rep ?? '', open: true, msg: '' })); return }
    if (mod && k === ' ') { e.preventDefault(); setSel({ anchor: { r: 0, c: active.c }, focus: { r: sheet.rows - 1, c: active.c }, extra: [] }); return }
    if (e.shiftKey && k === ' ') { e.preventDefault(); setSel({ anchor: { r: active.r, c: 0 }, focus: { r: active.r, c: sheet.cols - 1 }, extra: [] }); return }
    if (mod && (lk === 'c' || lk === 'x' || lk === 'v')) return // native clipboard events
    if (e.altKey && k === '=') { e.preventDefault(); autoSum(); return }
    if (mod && k === ';') { e.preventDefault(); const d = new Date(); writeCell(active.r, active.c, `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`); return }
    const jump = (dr: number, dc: number) => {
      // Ctrl+arrow: move to the edge of the data block
      let r = e.shiftKey ? sel.focus.r : active.r, c = e.shiftKey ? sel.focus.c : active.c
      const has = (rr: number, cc: number) => rawOf(rr, cc) !== ''
      if (mod) {
        const startFilled = has(r, c)
        const nextFilled = has(r + dr, c + dc)
        if (startFilled && nextFilled) { while (r + dr >= 0 && r + dr < sheet.rows && c + dc >= 0 && c + dc < sheet.cols && has(r + dr, c + dc)) { r += dr; c += dc } }
        else { r += dr; c += dc; while (r >= 0 && r < sheet.rows && c >= 0 && c < sheet.cols && !has(r, c) && r + dr >= 0 && r + dr < sheet.rows && c + dc >= 0 && c + dc < sheet.cols) { r += dr; c += dc } }
      } else { r += dr; c += dc }
      moveTo(r, c, e.shiftKey)
    }
    switch (k) {
      case 'ArrowDown': e.preventDefault(); jump(1, 0); return
      case 'ArrowUp': e.preventDefault(); jump(-1, 0); return
      case 'ArrowLeft': e.preventDefault(); jump(0, -1); return
      case 'ArrowRight': e.preventDefault(); jump(0, 1); return
      case 'Tab': e.preventDefault(); moveTo(active.r, active.c + (e.shiftKey ? -1 : 1)); return
      case 'Enter': e.preventDefault(); if (e.shiftKey) moveTo(active.r - 1, active.c); else if (prim.r1 !== prim.r2 || prim.c1 !== prim.c2) { setEditing(null); const rr = active.r + 1 > prim.r2 ? prim.r1 : active.r + 1; const cc = active.r + 1 > prim.r2 ? (active.c + 1 > prim.c2 ? prim.c1 : active.c + 1) : active.c; setSel({ ...sel, anchor: { r: rr, c: cc } }); reveal(rr, cc) } else startEditFromEnter(); return
      case 'Home': e.preventDefault(); moveTo(mod ? 0 : active.r, 0, e.shiftKey); return
      case 'End': if (mod) { e.preventDefault(); const u = usedRange(sheet); if (u) moveTo(u.r2, u.c2) } return
      case 'PageDown': e.preventDefault(); moveTo(active.r + 20, active.c, e.shiftKey); return
      case 'PageUp': e.preventDefault(); moveTo(active.r - 20, active.c, e.shiftKey); return
      case 'F2': e.preventDefault(); startEdit(active.r, active.c); return
      case 'Delete': case 'Backspace': e.preventDefault(); edit((s) => clearCells(s, ranges, 'contents')); return
      case 'Escape': setClip(null); setPainter(null); return
    }
    if (!mod && !e.altKey && k.length === 1) { e.preventDefault(); startEdit(active.r, active.c, k) }
  }
  const startEditFromEnter = () => startEdit(active.r, active.c)

  useEffect(() => {
    const kd = (e: KeyboardEvent) => keyRef.current(e)
    const inRoot = () => !!document.querySelector('[data-xl-root]') && !document.querySelector('[data-xl-root]')!.parentElement!.classList.contains('hidden')
    const isField = (e: Event) => { const t = e.target as HTMLElement; return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' }
    const cp = (e: ClipboardEvent) => { if (!inRoot() || isField(e) || editingRef.current) return; copyRef.current(false, e) }
    const ct = (e: ClipboardEvent) => { if (!inRoot() || isField(e) || editingRef.current) return; copyRef.current(true, e) }
    const ps = (e: ClipboardEvent) => { if (!inRoot() || isField(e) || editingRef.current) return; e.preventDefault(); pasteRef.current(e.clipboardData?.getData('text/plain') ?? '') }
    window.addEventListener('keydown', kd)
    window.addEventListener('copy', cp)
    window.addEventListener('cut', ct)
    window.addEventListener('paste', ps)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('copy', cp); window.removeEventListener('cut', ct); window.removeEventListener('paste', ps) }
  }, [])
  const editingRef = useRef(editing)
  editingRef.current = editing
  const copyRef = useRef(doCopy)
  copyRef.current = doCopy
  const pasteRef = useRef((text: string) => doPaste('all', text))
  pasteRef.current = (text: string) => doPaste('all', text)

  // ── render ─────────────────────────────────────────────────────────────────
  if (!doc || !wb || !sheet || !calc) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-5 p-8" data-xl-root>
        <div role="button" tabIndex={0} onClick={() => fileInput.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void openFile(f) }}
          className="group flex w-full max-w-md cursor-pointer select-none flex-col items-center gap-5 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]">
          <div className="flex size-14 items-center justify-center rounded-xl bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)] group-hover:bg-[var(--color-accent)] group-hover:text-white"><FileSpreadsheet className="size-6" aria-hidden /></div>
          <div className="text-center">
            <p className="text-base font-medium text-[var(--color-text-primary)]">{busy ? x('opening') : x('dropzone')}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"><Upload className="size-4" />{x('browse')}</div>
          </div>
          <p className="text-xs text-[var(--color-text-disabled)]">XLSX · CSV · ODS · XLS</p>
        </div>
        <Button variant="secondary" size="sm" onClick={blank} className="gap-2"><FilePlus2 className="size-4" />{x('newBlank')}</Button>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <input ref={fileInput} type="file" accept=".xlsx,.xlsm,.xls,.csv,.ods,.edavio" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
      </div>
    )
  }

  const stats = (() => {
    let sum = 0, count = 0, nums = 0, min = Infinity, max = -Infinity
    forEachCell(ranges, (r, c) => {
      if (r >= sheet.rows || c >= sheet.cols) return
      const v = calc.value(si, r, c)
      if (v !== null && v !== '') count++
      if (typeof v === 'number') { sum += v; nums++; min = Math.min(min, v); max = Math.max(max, v) }
    })
    return { sum, count, nums, avg: nums ? sum / nums : 0, min, max }
  })()
  const fmtN = (n: number) => formatValue(n).text
  const multi = ranges.length > 1 || prim.r1 !== prim.r2 || prim.c1 !== prim.c2
  const barText = editing ? editing.text : displayRaw(active.r, active.c)
  const hasSel = !!sel
  void hasSel
  const lang = i18n.language

  const bordersMenu = <BordersMenu x={x} onPick={borders} />

  return (
    <div data-xl-root className="flex h-full min-h-0 flex-1 flex-col bg-[var(--color-surface)]">
      {/* title bar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3">
        <FileSpreadsheet size={18} className="shrink-0 text-emerald-600" />
        <input value={wb.title} onChange={(e) => setDoc({ ...doc, wb: { ...wb, title: e.target.value } })} aria-label={x('titleLabel')}
          className="h-8 w-56 min-w-0 rounded-md bg-transparent px-2 text-sm font-medium text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-surface-raised)] focus:bg-[var(--color-surface-raised)]" />
        <Tb icon={Undo2} label={x('undo')} disabled={!doc.past.length} onClick={undo} />
        <Tb icon={Redo2} label={x('redo')} disabled={!doc.future.length} onClick={redo} />
        <div className="flex-1" />
        {notice && <span role="status" className="truncate text-xs text-[var(--color-text-secondary)]">{notice}</span>}
        {error && <span role="alert" className="truncate text-xs text-red-500">{error}</span>}
        <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()} className="gap-1.5"><Upload className="size-4" />{x('open')}</Button>
        <Button variant="secondary" size="sm" title={t('workspace.saveProjectHint')} onClick={() => void saveProject()} className="gap-1.5"><Save className="size-4" />{t('workspace.saveProject')}</Button>
        <Menu label={x('export')} width={200} trigger={<span className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-sm font-medium text-white"><Download className="size-4" />{busy ? x('exporting') : x('export')}</span>}>
          {(close) => <div><MenuItem onClick={() => { close(); void doExport('xlsx') }}>Excel (.xlsx)</MenuItem><MenuItem onClick={() => { close(); void doExport('csv') }}>CSV (.csv)</MenuItem></div>}
        </Menu>
        <input ref={fileInput} type="file" accept=".xlsx,.xlsm,.xls,.csv,.ods,.edavio" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
      </div>

      {/* ribbon */}
      <div className="shrink-0 border-b border-[var(--color-border)]">
        <div className="flex h-8 items-center gap-1 px-3" role="tablist">
          {(['home', 'insert', 'formulas', 'data', 'view'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
              className={cn('h-8 rounded-t-md px-3 text-xs font-medium', tab === k ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>{x(`tab.${k}`)}</button>
          ))}
        </div>
        <div className="h-[84px] overflow-x-auto overflow-y-hidden px-3 pb-1">
          {tab === 'home' && (
            <div className="flex w-max flex-col gap-1 pt-1">
              <div className="flex flex-nowrap items-center gap-0.5">
                <Tb icon={ClipboardPaste} label={x('paste')} onClick={() => doPaste('all')}>{x('paste')}</Tb>
                <Menu label={x('pasteSpecial')} width={200} trigger={<span className="sr-only">{x('pasteSpecial')}</span>}>
                  {(close) => <div>{(['values', 'formulas', 'formats', 'transpose'] as const).map((m) => <MenuItem key={m} onClick={() => { close(); doPaste(m) }}>{x(`paste_${m}`)}</MenuItem>)}</div>}
                </Menu>
                <Tb icon={Scissors} label={x('cut')} onClick={() => doCopy(true)} />
                <Tb icon={Copy} label={x('copy')} onClick={() => doCopy(false)} />
                <Tb icon={Paintbrush} label={x('painter')} active={!!painter} onClick={() => setPainter(painter ? null : { ...activeStyle })} />
                <Sep />
                <FontPicker value={activeStyle.font ?? DEFAULT_FONT} onPick={(f) => applyStyle((s) => ({ ...s, font: f === DEFAULT_FONT ? undefined : f }))} searchLabel={x('font')} />
                <SizeField value={activeStyle.size ?? DEFAULT_SIZE} onPick={(n) => applyStyle((s) => ({ ...s, size: n === DEFAULT_SIZE ? undefined : n }))} label={x('size')} />
                <Sep />
                <Tb icon={Bold} label={x('bold')} active={!!activeStyle.bold} onClick={() => toggle('bold')} />
                <Tb icon={Italic} label={x('italic')} active={!!activeStyle.italic} onClick={() => toggle('italic')} />
                <Tb icon={Underline} label={x('underline')} active={!!activeStyle.underline} onClick={() => toggle('underline')} />
                <Tb icon={Strikethrough} label={x('strike')} active={!!activeStyle.strike} onClick={() => toggle('strike')} />
                {bordersMenu}
                <ColorMenu icon={PaintBucket} label={x('fill')} value={activeStyle.bg} noneLabel={x('noFill')} onPick={(c) => applyStyle((s) => ({ ...s, bg: c ?? undefined }))} />
                <ColorMenu icon={Type} label={x('textColor')} value={activeStyle.color ?? '#111827'} onPick={(c) => applyStyle((s) => ({ ...s, color: c ?? undefined }))} />
                <Sep />
                <Menu label={x('cellStyles')} width={220} trigger={<span className="flex items-center gap-1.5"><Palette size={16} />{x('cellStyles')}</span>}>
                  {(close) => <div>{CELL_STYLES.map((cs) => <button key={cs.id} type="button" onClick={() => { applyStyle((s) => ({ ...s, ...cs.style })); close() }} className="mb-1 block w-full truncate rounded border border-[var(--color-border)] px-2 py-1 text-left text-sm" style={{ background: cs.style.bg, color: cs.style.color, fontWeight: cs.style.bold ? 700 : 400, fontSize: cs.style.size ? Math.min(18, cs.style.size) : undefined }}>{x(`style_${cs.id}`)}</button>)}</div>}
                </Menu>
                <Tb icon={Table2} label={x('asTable')} onClick={() => edit((s) => formatAsTable(s, regionOf(), valueOf))}>{x('asTable')}</Tb>
              </div>
              <div className="flex flex-nowrap items-center gap-0.5">
                {(['left', 'center', 'right'] as const).map((a) => <Tb key={a} icon={{ left: AlignLeft, center: AlignCenter, right: AlignRight }[a]} label={x(`align_${a}`)} active={activeStyle.h === a} onClick={() => applyStyle((s) => ({ ...s, h: activeStyle.h === a ? undefined : a }))} />)}
                <Tb icon={AlignJustify} label={x('align_general')} active={!activeStyle.h || activeStyle.h === 'general'} onClick={() => applyStyle((s) => ({ ...s, h: undefined }))} />
                <Sep />
                <Tb icon={AlignVerticalJustifyStart} label={x('valign_top')} active={activeStyle.v === 'top'} onClick={() => applyStyle((s) => ({ ...s, v: 'top' }))} />
                <Tb icon={AlignVerticalJustifyCenter} label={x('valign_middle')} active={activeStyle.v === 'middle'} onClick={() => applyStyle((s) => ({ ...s, v: 'middle' }))} />
                <Tb icon={AlignVerticalJustifyEnd} label={x('valign_bottom')} active={!activeStyle.v || activeStyle.v === 'bottom'} onClick={() => applyStyle((s) => ({ ...s, v: undefined }))} />
                <Tb icon={IndentDecrease} label={x('outdent')} onClick={() => applyStyle((s) => ({ ...s, indent: Math.max(0, (s.indent ?? 0) - 1) || undefined }))} />
                <Tb icon={IndentIncrease} label={x('indent')} onClick={() => applyStyle((s) => ({ ...s, indent: (s.indent ?? 0) + 1 }))} />
                <Tb icon={WrapText} label={x('wrap')} active={!!activeStyle.wrap} onClick={() => applyStyle((s) => ({ ...s, wrap: !activeStyle.wrap || undefined }))} />
                <Menu label={x('merge')} width={200} trigger={<span className="flex items-center gap-1.5"><Merge size={16} />{x('merge')}</span>}>
                  {(close) => <div><MenuItem onClick={() => { close(); merge('center') }}>{x('mergeCenter')}</MenuItem><MenuItem onClick={() => { close(); merge('merge') }}>{x('mergeCells')}</MenuItem><MenuItem onClick={() => { close(); merge('unmerge') }}>{x('unmerge')}</MenuItem></div>}
                </Menu>
                <Sep />
                <Menu label={x('numberFormat')} width={250} trigger={<span className="flex w-24 items-center truncate text-xs">{NUMBER_FORMATS.find((f) => f.code === (activeStyle.fmt ?? 'General'))?.label ?? x('custom')}</span>}>
                  {(close) => <NumberFormatList x={x} current={activeStyle.fmt ?? 'General'} onPick={(c) => { setFmt(c); close() }} />}
                </Menu>
                <Tb icon={CircleDollarSign} label={x('fmtCurrency')} onClick={() => setFmt('#,##0.00 "€"')} />
                <Tb icon={Percent} label={x('fmtPercent')} onClick={() => setFmt('0%')} />
                <Tb icon={Hash} label={x('fmtThousands')} onClick={() => setFmt('#,##0.00')} />
                <Tb label={x('decMore')} onClick={() => decimals(1)}><span className="text-[10px] font-semibold">.0→</span></Tb>
                <Tb label={x('decLess')} onClick={() => decimals(-1)}><span className="text-[10px] font-semibold">←.0</span></Tb>
                <Sep />
                <Menu label={x('condFormat')} width={240} trigger={<span className="flex items-center gap-1.5"><Palette size={16} />{x('condFormat')}</span>}>
                  {(close) => (
                    <div>
                      <MenuItem onClick={() => { close(); setDialog({ kind: 'cf' }) }}>{x('cfNew')}</MenuItem>
                      <MenuItem onClick={() => { close(); addRule({ type: 'bar', bg: '#60a5fa' }) }}>{x('cfBars')}</MenuItem>
                      <MenuItem onClick={() => { close(); addRule({ type: 'scale', bg: '#22c55e' }) }}>{x('cfScale')}</MenuItem>
                      <MenuItem onClick={() => { close(); addRule({ type: 'dup', bg: '#fecaca', color: '#991b1b' }) }}>{x('cfDup')}</MenuItem>
                      <MenuItem onClick={() => { close(); edit((s) => ({ ...s, rules: s.rules.filter((r) => !ranges.some((g) => overlaps(g, r.range))) })) }}>{x('cfClear')}</MenuItem>
                    </div>
                  )}
                </Menu>
              </div>
            </div>
          )}
          {tab === 'home' && null}
          {tab === 'insert' && (
            <div className="flex w-max flex-nowrap items-center gap-0.5 pt-3">
              <Tb icon={ChartColumn} label={x('chartColumn')} onClick={() => addChart('column')}>{x('chartColumn')}</Tb>
              <Tb icon={ChartBar} label={x('chartBar')} onClick={() => addChart('bar')}>{x('chartBar')}</Tb>
              <Tb icon={ChartLine} label={x('chartLine')} onClick={() => addChart('line')}>{x('chartLine')}</Tb>
              <Tb icon={ChartPie} label={x('chartPie')} onClick={() => addChart('pie')}>{x('chartPie')}</Tb>
              <Sep />
              <Tb icon={Table2} label={x('pivot')} onClick={() => setDialog({ kind: 'pivot' })}>{x('pivot')}</Tb>
              <Sep />
              <Tb icon={Rows3} label={x('insRows')} onClick={() => insertRows(false)}>{x('insRows')}</Tb>
              <Tb icon={Columns3} label={x('insCols')} onClick={() => insertCols(false)}>{x('insCols')}</Tb>
              <span className="ml-3 max-w-sm text-xs text-[var(--color-text-muted)]">{x('chartHint')}</span>
            </div>
          )}
          {tab === 'formulas' && (
            <div className="flex w-max flex-nowrap items-center gap-0.5 pt-3">
              <Menu label="AutoSum" width={200} trigger={<span className="flex items-center gap-1.5"><Sigma size={16} />{x('autosum')}</span>}>
                {(close) => <div>{[['SUM', x('fn_sum')], ['AVERAGE', x('fn_avg')], ['COUNT', x('fn_count')], ['MAX', x('fn_max')], ['MIN', x('fn_min')]].map(([f, l]) => <MenuItem key={f} onClick={() => { close(); autoSum(f) }}>{l}</MenuItem>)}</div>}
              </Menu>
              <Menu label={x('insertFunction')} width={260} trigger={<span className="flex items-center gap-1.5">fx {x('insertFunction')}</span>}>
                {(close) => <FunctionList onPick={(f) => { close(); insertFn(f) }} />}
              </Menu>
              <Sep />
              <Tb icon={Eye} label={x('showFormulas')} active={showFormulas} onClick={() => setShowFormulas(!showFormulas)}>{x('showFormulas')}</Tb>
              <span className="ml-3 max-w-sm text-xs text-[var(--color-text-muted)]">{x('formulaHint')}</span>
            </div>
          )}
          {tab === 'data' && (
            <div className="flex w-max flex-nowrap items-center gap-0.5 pt-3">
              <Tb icon={ArrowDownAZ} label={x('sortAsc')} onClick={() => doSort(true)}>{x('sortAsc')}</Tb>
              <Tb icon={ArrowUpAZ} label={x('sortDesc')} onClick={() => doSort(false)}>{x('sortDesc')}</Tb>
              <Tb icon={Filter} label={x('filter')} active={!!sheet.filter} onClick={toggleFilter}>{x('filter')}</Tb>
              <Sep />
              <Tb icon={ListChecks} label={x('validation')} onClick={() => setDialog({ kind: 'validation' })}>{x('validation')}</Tb>
              <Tb icon={ListFilter} label={x('removeDup')} onClick={removeDuplicates}>{x('removeDup')}</Tb>
              <Menu label={x('fill')} width={200} trigger={<span className="flex items-center gap-1.5">{x('fillMenu')}</span>}>
                {(close) => <div><MenuItem onClick={() => { close(); fillDir('down') }}>{x('fillDown')} (Ctrl+D)</MenuItem><MenuItem onClick={() => { close(); fillDir('right') }}>{x('fillRight')} (Ctrl+R)</MenuItem></div>}
              </Menu>
              <Menu label={x('clear')} width={200} trigger={<span className="flex items-center gap-1.5"><Eraser size={16} />{x('clear')}</span>}>
                {(close) => <div>{(['all', 'contents', 'formats'] as const).map((k) => <MenuItem key={k} onClick={() => { close(); edit((s) => clearCells(s, ranges, k)) }}>{x(`clear_${k}`)}</MenuItem>)}</div>}
              </Menu>
              <Sep />
              <Tb icon={Search} label={x('find')} onClick={() => setFind({ q: '', rep: '', open: true, msg: '' })}>{x('find')}</Tb>
            </div>
          )}
          {tab === 'view' && (
            <div className="flex w-max flex-nowrap items-center gap-0.5 pt-3">
              <Menu label={x('freeze')} width={220} trigger={<span className="flex items-center gap-1.5"><Snowflake size={16} />{x('freeze')}</span>}>
                {(close) => (
                  <div>
                    <MenuItem onClick={() => { close(); edit((s) => ({ ...s, freezeR: prim.r1, freezeC: prim.c1 })) }}>{x('freezeAt')}</MenuItem>
                    <MenuItem onClick={() => { close(); edit((s) => ({ ...s, freezeR: 1, freezeC: 0 })) }}>{x('freezeRow')}</MenuItem>
                    <MenuItem onClick={() => { close(); edit((s) => ({ ...s, freezeR: 0, freezeC: 1 })) }}>{x('freezeCol')}</MenuItem>
                    <MenuItem onClick={() => { close(); edit((s) => ({ ...s, freezeR: 0, freezeC: 0 })) }}>{x('unfreeze')}</MenuItem>
                  </div>
                )}
              </Menu>
              <Tb icon={Grid3x3} label={x('gridlines')} active={sheet.showGrid} onClick={() => edit((s) => ({ ...s, showGrid: !s.showGrid }))}>{x('gridlines')}</Tb>
              <Tb icon={Eye} label={x('showFormulas')} active={showFormulas} onClick={() => setShowFormulas(!showFormulas)}>{x('showFormulas')}</Tb>
              <Sep />
              <Tb icon={Columns3} label={x('hideCols')} onClick={() => hide('col', true)} />
              <Tb icon={Rows3} label={x('hideRows')} onClick={() => hide('row', true)} />
              <Tb label={x('unhide')} onClick={() => { hide('col', false); hide('row', false) }}>{x('unhide')}</Tb>
            </div>
          )}
        </div>
      </div>

      {/* formula bar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-2">
        <input value={nameBox ?? rangeLabel(multi ? prim : { r1: active.r, c1: active.c, r2: active.r, c2: active.c })} aria-label={x('nameBox')}
          onChange={(e) => setNameBox(e.target.value)} onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const [a, b = a] = (nameBox ?? '').split(':'); const p = parseRef(a!), q = parseRef(b!)
              if (p && q) { setSel({ anchor: p, focus: q, extra: [] }); reveal(p.r, p.c) }
              setNameBox(null); scrollerFocus()
            } else if (e.key === 'Escape') { setNameBox(null); scrollerFocus() }
          }}
          onBlur={() => setNameBox(null)}
          className="h-7 w-28 rounded border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2 text-center text-xs outline-none focus:border-emerald-600" />
        <span className="text-xs italic text-[var(--color-text-muted)]">fx</span>
        <input value={barText} aria-label={x('formulaBar')} spellCheck={false}
          onFocus={() => { if (!editing) setEditing({ r: active.r, c: active.c, text: displayRaw(active.r, active.c), mode: 'edit' }) }}
          onChange={(e) => setEditing({ r: editing?.r ?? active.r, c: editing?.c ?? active.c, text: e.target.value, mode: 'edit' })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit('down'); scrollerFocus() } else if (e.key === 'Escape') { setEditing(null); scrollerFocus() } }}
          className="h-7 min-w-0 flex-1 rounded border border-[var(--color-border)] bg-transparent px-2 font-mono text-xs outline-none focus:border-emerald-600" />
      </div>

      {/* grid */}
      <Grid
        ref={grid} sheet={sheet} calc={calc} zoom={zoom} rowSizes={rowSizes} colSizes={colSizes} sel={sel} showFormulas={showFormulas} editing={editing && !(document.activeElement?.getAttribute('aria-label') === x('formulaBar')) ? editing : editing && document.activeElement?.getAttribute('aria-label') === x('formulaBar') ? null : null}
        clip={clip && clip.sheetName === sheet.name ? clip.src : null} filterRange={sheet.filter?.range ?? null} cf={cf} painterActive={!!painter}
        onSelect={(s) => { tabOrigin.current = null; setSel(s); if (!editing) reveal(s.focus.r, s.focus.c) }}
        onStartEdit={startEdit} onEditChange={(text) => setEditing((e) => (e ? { ...e, text } : e))} onEditKey={onEditKey}
        onEditBlur={() => { const ae = document.activeElement; if (ae?.getAttribute('aria-label') === x('formulaBar')) return; if (editingRef.current) commitEdit('none') }}
        onPoint={onPoint} onResize={setSize} onAutoFit={autoFit} onFill={doFill} onNeedMore={growSheet}
        onContext={(cx, cy) => setCtx({ x: cx, y: cy })}
        onFilterClick={(col, rect) => setDialog({ kind: 'filter', col, x: rect.left, y: rect.bottom + 4 })}
        onZoom={(d) => setZoom((z) => clamp(Math.round((z + d * 0.1) * 10) / 10, 0.5, 2.5))}
        overlay={(sheet.charts ?? []).map((ch) => <ChartView key={ch.id} def={ch} zoom={zoom} selected={chartSel === ch.id} data={buildChartData(ch, valueOf)} onSelect={() => setChartSel(ch.id)} onChange={(p) => patchChart(ch.id, p)} onDelete={() => { edit((s) => ({ ...s, charts: (s.charts ?? []).filter((c) => c.id !== ch.id) })); setChartSel(null) }} />)}
        validationItems={validationAt(active.r, active.c)?.type === 'list' ? validationAt(active.r, active.c)!.items ?? [] : null}
        onPickValidation={(v) => writeCell(active.r, active.c, v)}
        onPaintApply={() => { if (painter) { edit((s) => patchStyle(s, ranges, () => ({ ...painter }))); setPainter(null) } }}
      />

      {/* sheet tabs + status */}
      <div className="flex h-9 shrink-0 items-center border-t border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
        <div className="flex items-center px-1">
          <Tb icon={ChevronLeft} label={x('prevSheet')} onClick={() => setSi((i) => Math.max(0, i - 1))} className="min-w-6" />
          <Tb icon={ChevronRight} label={x('nextSheet')} onClick={() => setSi((i) => Math.min(wb.sheets.length - 1, i + 1))} className="min-w-6" />
        </div>
        <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
          {wb.sheets.map((s, i) => (
            <div key={s.id} onContextMenu={(e) => { e.preventDefault(); setTabMenu({ i, x: e.clientX, y: e.clientY }) }} onClick={() => { setEditing(null); setSi(i); setSel(single(0, 0)) }}
              className={cn('flex h-7 shrink-0 cursor-pointer items-center rounded-t-md border border-b-0 px-3 text-xs', i === si ? 'border-[var(--color-border)] bg-[var(--color-surface)] font-semibold text-emerald-700' : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]')}
              style={s.tabColor ? { borderBottom: `3px solid ${s.tabColor}` } : undefined}>
              {renaming === i ? (
                <input autoFocus defaultValue={s.name} onClick={(e) => e.stopPropagation()} onBlur={(e) => { renameSheet(i, e.target.value); setRenaming(null) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }} className="w-24 bg-transparent outline-none" />
              ) : <span onDoubleClick={() => setRenaming(i)}>{s.name}</span>}
            </div>
          ))}
          <Tb icon={Plus} label={x('addSheet')} onClick={addSheet} className="min-w-7" />
        </div>
        <div className="flex shrink-0 items-center gap-4 px-3 text-xs text-[var(--color-text-secondary)]">
          {stats.nums > 1 || (multi && stats.count > 0) ? <span>{x('statAvg')} {fmtN(stats.avg)} · {x('statCount')} {stats.count} · {x('statSum')} {fmtN(stats.sum)}{stats.nums > 1 ? ` · ${x('statMin')} ${fmtN(stats.min)} · ${x('statMax')} ${fmtN(stats.max)}` : ''}</span> : null}
          <div className="flex items-center gap-1.5"><span>{Math.round(zoom * 100)}%</span><input type="range" min={50} max={250} step={10} value={Math.round(zoom * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100)} aria-label={x('zoom')} className="w-24" /></div>
        </div>
      </div>

      {/* context menu */}
      {ctx && <ContextMenu x={x} pos={ctx} onClose={() => setCtx(null)} actions={{
        cut: () => doCopy(true), copy: () => doCopy(false), paste: () => doPaste('all'), pasteValues: () => doPaste('values'),
        clear: () => edit((s) => clearCells(s, ranges, 'contents')),
        insRow: () => insertRows(false), insCol: () => insertCols(false), delRow: deleteRows, delCol: deleteCols,
        hideRow: () => hide('row', true), hideCol: () => hide('col', true), unhide: () => { hide('row', false); hide('col', false) },
        merge: () => merge('center'), unmerge: () => merge('unmerge'),
        colWidth: () => setDialog({ kind: 'prompt', title: x('colWidth'), value: String(sheet.colW[prim.c1] ?? DEFAULT_COL_W), onOk: (v) => { const n = Number(v); if (n > 0) edit((s) => ({ ...s, colW: { ...s.colW, ...Object.fromEntries(range(prim.c1, prim.c2).map((c) => [c, n])) } })) } }),
        rowHeight: () => setDialog({ kind: 'prompt', title: x('rowHeight'), value: String(sheet.rowH[prim.r1] ?? DEFAULT_ROW_H), onOk: (v) => { const n = Number(v); if (n > 0) edit((s) => ({ ...s, rowH: { ...s.rowH, ...Object.fromEntries(range(prim.r1, prim.r2).map((r) => [r, n])) } })) } }),
        sortAsc: () => doSort(true), sortDesc: () => doSort(false),
      }} />}

      {tabMenu && (
        <PopMenu pos={tabMenu} onClose={() => setTabMenu(null)}>
          {(close) => (
            <div>
              <MenuItem onClick={() => { close(); setRenaming(tabMenu.i) }}>{x('renameSheet')}</MenuItem>
              <MenuItem onClick={() => { close(); duplicateSheet(tabMenu.i) }}>{x('duplicateSheet')}</MenuItem>
              <MenuItem onClick={() => { close(); moveSheet(tabMenu.i, -1) }}>{x('moveLeft')}</MenuItem>
              <MenuItem onClick={() => { close(); moveSheet(tabMenu.i, 1) }}>{x('moveRight')}</MenuItem>
              <MenuItem disabled={wb.sheets.length < 2} onClick={() => { close(); deleteSheet(tabMenu.i) }}>{x('deleteSheet')}</MenuItem>
              <div className="flex flex-wrap gap-1 p-2">{['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#6b7280'].map((c) => <button key={c} type="button" aria-label={c} onClick={() => { close(); commit((w) => ({ ...w, sheets: w.sheets.map((s, j) => (j === tabMenu.i ? { ...s, tabColor: c } : s)) })) }} className="size-5 rounded-full border border-black/10" style={{ background: c }} />)}</div>
            </div>
          )}
        </PopMenu>
      )}

      {find?.open && (
        <div className="absolute right-6 top-40 z-40 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between text-sm font-medium">{x('findReplace')}<button type="button" aria-label="Close" onClick={() => setFind(null)}><X size={14} /></button></div>
          <input autoFocus value={find.q} onChange={(e) => setFind({ ...find, q: e.target.value, msg: '' })} onKeyDown={(e) => e.key === 'Enter' && runFind(e.shiftKey ? -1 : 1)} placeholder={x('findWhat')} className="mb-2 h-8 w-full rounded border border-[var(--color-border)] bg-transparent px-2 text-sm outline-none focus:border-emerald-600" />
          <input value={find.rep} onChange={(e) => setFind({ ...find, rep: e.target.value })} placeholder={x('replaceWith')} className="mb-2 h-8 w-full rounded border border-[var(--color-border)] bg-transparent px-2 text-sm outline-none focus:border-emerald-600" />
          <div className="flex flex-wrap gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => runFind(-1)}>{x('prev')}</Button>
            <Button size="xs" variant="secondary" onClick={() => runFind(1)}>{x('next')}</Button>
            <Button size="xs" variant="secondary" onClick={() => runFind(1, 'one')}>{x('replace')}</Button>
            <Button size="xs" variant="secondary" onClick={() => runFind(1, 'all')}>{x('replaceAll')}</Button>
          </div>
          {find.msg && <p className="mt-2 text-xs text-[var(--color-text-muted)]">{find.msg}</p>}
        </div>
      )}

      {dialog?.kind === 'prompt' && <PromptDialog x={x} d={dialog} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'validation' && <ValidationDialog x={x} onClose={() => setDialog(null)} current={validationAt(active.r, active.c)} onOk={(v) => { edit((s) => ({ ...s, validations: [...(s.validations ?? []).filter((o) => !overlaps(o.range, prim)), ...(v ? [{ ...v, range: prim }] : [])] })); setDialog(null) }} />}
      {dialog?.kind === 'pivot' && <PivotDialog x={x} onClose={() => setDialog(null)} headers={range(regionOf().c1, regionOf().c2).map((c) => ({ c, name: String(valueOf(regionOf().r1, c) ?? colName(c)) }))} onOk={(o) => { createPivot(o); setDialog(null) }} />}
      {dialog?.kind === 'cf' && <CfDialog x={x} onClose={() => setDialog(null)} onOk={(rule) => { addRule(rule); setDialog(null) }} />}
      {dialog?.kind === 'filter' && sheet.filter && (
        <FilterPopup x={x} d={dialog} sheet={sheet} calc={calc} si={si} onClose={() => setDialog(null)}
          onApply={(allowed) => edit((s) => ({ ...s, filter: s.filter ? { ...s.filter, allowed: { ...s.filter.allowed, ...(allowed ? { [dialog.col]: allowed } : {}) } } : s.filter }))}
          onClear={() => edit((s) => { if (!s.filter) return s; const a = { ...s.filter.allowed }; delete a[dialog.col]; return { ...s, filter: { ...s.filter, allowed: a } } })}
          onSort={(asc) => { const g = sheet.filter!.range; edit((s) => sortRange(s, g, dialog.col, asc, valueOf, true)) }} />
      )}
      <span className="hidden">{lang}{ROW_HEADER_W}{COL_HEADER_H}{colName(0)}{normRange({ r1: 0, c1: 0, r2: 0, c2: 0 }).r1}{FErr.name}{shiftFormula.name}{parseTyped.name}</span>
    </div>
  )

  function addRule(r: Partial<CondRule> & { type: RuleType }) {
    const rule: CondRule = { id: uid(), range: prim, ...r }
    edit((s) => ({ ...s, rules: [...s.rules, rule] }))
  }
}

// ── helpers & small components ───────────────────────────────────────────────

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const overlaps = (a: Range, b: Range) => a.r1 <= b.r2 && a.r2 >= b.r1 && a.c1 <= b.c2 && a.c2 >= b.c1
const numOrText = (s: string): number | string => { const n = parseTyped(s); return n ? n.num : Number.isFinite(Number(s.replace(',', '.'))) && s.trim() !== '' ? Number(s.replace(',', '.')) : s }
function mix(a: string, b: string, p: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * p + ((pb >> s) & 255) * (1 - p))
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')
}

const CELL_STYLES: { id: string; style: CellStyle }[] = [
  { id: 'title', style: { bold: true, size: 18, color: '#1f2937' } },
  { id: 'heading', style: { bold: true, size: 13, color: '#ffffff', bg: '#1d6f42' } },
  { id: 'good', style: { bg: '#c6efce', color: '#006100' } },
  { id: 'bad', style: { bg: '#ffc7ce', color: '#9c0006' } },
  { id: 'neutral', style: { bg: '#ffeb9c', color: '#9c5700' } },
  { id: 'input', style: { bg: '#ffcc99', color: '#3f3f76' } },
  { id: 'note', style: { bg: '#ffffcc', italic: true } },
]

function formatAsTable(s: Sheet, g: Range, valueOf: (r: number, c: number) => V): Sheet {
  const header = looksLikeHeader(g, valueOf) || true
  let out = s
  const line: Border = { style: 'thin', color: '#a7c4b5' }
  out = patchStyle(out, [g], (st) => ({ ...st, bt: line, bb: line, bl: line, br: line }))
  for (let r = g.r1; r <= g.r2; r++) {
    const band = r === g.r1 && header ? { bg: '#1d6f42', color: '#ffffff', bold: true } : (r - g.r1) % 2 === 0 ? { bg: '#e8f3ec' } : { bg: '#ffffff' }
    out = patchStyle(out, [{ r1: r, r2: r, c1: g.c1, c2: g.c2 }], (st) => ({ ...st, ...band }))
  }
  return { ...out, filter: out.filter ?? { range: g, allowed: {} } }
}

function BordersMenu({ x, onPick }: { x: (k: string) => string; onPick: (p: BorderPreset, s: BorderStyle, c: string) => void }) {
  const [style, setStyle] = useState<BorderStyle>('thin')
  const [color, setColor] = useState('#000000')
  const items: [BorderPreset, string][] = [['all', 'b_all'], ['outer', 'b_outer'], ['inner', 'b_inner'], ['top', 'b_top'], ['bottom', 'b_bottom'], ['left', 'b_left'], ['right', 'b_right'], ['topBottom', 'b_topBottom'], ['none', 'b_none']]
  return (
    <Menu label={x('borders')} width={230} trigger={<Borders size={16} />}>
      {(close) => (
        <div>
          {items.map(([p, k]) => <MenuItem key={p} onClick={() => { onPick(p, style, color); close() }}>{x(k)}</MenuItem>)}
          <MenuTitle>{x('b_style')}</MenuTitle>
          <div className="flex flex-wrap gap-1 px-1">
            {(['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'] as BorderStyle[]).map((s) => <button key={s} type="button" onClick={() => setStyle(s)} className={cn('rounded border px-1.5 py-0.5 text-[11px]', style === s ? 'border-emerald-600 text-emerald-700' : 'border-[var(--color-border)]')}>{x(`bs_${s}`)}</button>)}
          </div>
          <label className="mt-2 flex items-center justify-between px-2 text-xs">{x('b_color')}<input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-8 border-0 bg-transparent p-0" /></label>
        </div>
      )}
    </Menu>
  )
}

function NumberFormatList({ x, current, onPick }: { x: (k: string) => string; current: string; onPick: (c: string) => void }) {
  const [custom, setCustom] = useState('')
  return (
    <div>
      {NUMBER_FORMATS.map((f) => (
        <button key={f.id} type="button" onClick={() => onPick(f.code)} className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--color-surface-raised)]', f.code === current && 'text-emerald-700')}>
          <span>{f.label}</span><span className="text-[var(--color-text-muted)]">{f.sample}</span>
        </button>
      ))}
      <MenuTitle>{x('customFormat')}</MenuTitle>
      <div className="flex gap-1 px-1">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder='0.00 "kg"' className="h-7 min-w-0 flex-1 rounded border border-[var(--color-border)] bg-transparent px-2 text-xs outline-none" />
        <Button size="xs" variant="secondary" onClick={() => custom && onPick(custom)}>OK</Button>
      </div>
    </div>
  )
}

function FunctionList({ onPick }: { onPick: (f: string) => void }) {
  const [q, setQ] = useState('')
  const list = FUNCTION_NAMES.filter((f) => f.includes(q.toUpperCase()))
  return (
    <div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="SUM, IF, VLOOKUP…" className="mb-1 h-8 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2 text-xs outline-none" />
      <div className="max-h-64 overflow-auto">{list.map((f) => <button key={f} type="button" onClick={() => onPick(f)} className="block w-full rounded px-2 py-1 text-left font-mono text-xs hover:bg-[var(--color-surface-raised)]">{f}</button>)}</div>
    </div>
  )
}

function PopMenu({ pos, onClose, children }: { pos: { x: number; y: number }; onClose: () => void; children: (close: () => void) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const d = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', d, true)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('pointerdown', d, true); document.removeEventListener('keydown', k) }
  }, [onClose])
  return (
    <div ref={ref} role="menu" style={{ left: Math.min(pos.x, window.innerWidth - 230), top: Math.min(pos.y, window.innerHeight - 340) }} className="fixed z-[70] max-h-[70vh] w-56 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl">
      {children(onClose)}
    </div>
  )
}

function ContextMenu({ x, pos, onClose, actions }: { x: (k: string) => string; pos: { x: number; y: number }; onClose: () => void; actions: Record<string, () => void> }) {
  const item = (k: string, a: string) => <MenuItem key={k} onClick={() => { onClose(); actions[a]!() }}>{x(`ctx_${k}`)}</MenuItem>
  return (
    <PopMenu pos={pos} onClose={onClose}>
      {() => (
        <div>
          {item('cut', 'cut')}{item('copy', 'copy')}{item('paste', 'paste')}{item('pasteValues', 'pasteValues')}
          <div className="my-1 h-px bg-[var(--color-border)]" />
          {item('insRow', 'insRow')}{item('insCol', 'insCol')}{item('delRow', 'delRow')}{item('delCol', 'delCol')}{item('clear', 'clear')}
          <div className="my-1 h-px bg-[var(--color-border)]" />
          {item('merge', 'merge')}{item('unmerge', 'unmerge')}
          {item('colWidth', 'colWidth')}{item('rowHeight', 'rowHeight')}
          {item('hideRow', 'hideRow')}{item('hideCol', 'hideCol')}{item('unhide', 'unhide')}
          <div className="my-1 h-px bg-[var(--color-border)]" />
          {item('sortAsc', 'sortAsc')}{item('sortDesc', 'sortDesc')}
        </div>
      )}
    </PopMenu>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function PromptDialog({ x, d, onClose }: { x: (k: string) => string; d: { title: string; value: string; onOk: (v: string) => void }; onClose: () => void }) {
  const [v, setV] = useState(d.value)
  return (
    <Modal title={d.title} onClose={onClose}>
      <input autoFocus type="number" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { d.onOk(v); onClose() } }} className="mb-4 h-9 w-full rounded border border-[var(--color-border)] bg-transparent px-2 text-sm outline-none focus:border-emerald-600" />
      <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>{x('cancel')}</Button><Button size="sm" onClick={() => { d.onOk(v); onClose() }}>OK</Button></div>
    </Modal>
  )
}

function CfDialog({ x, onClose, onOk }: { x: (k: string) => string; onClose: () => void; onOk: (r: { type: RuleType; a?: string; b?: string; bg?: string; color?: string; bold?: boolean }) => void }) {
  const [type, setType] = useState<RuleType>('gt')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [bg, setBg] = useState('#ffc7ce')
  const [color, setColor] = useState('#9c0006')
  const types: RuleType[] = ['gt', 'lt', 'eq', 'neq', 'between', 'contains', 'blank', 'dup']
  return (
    <Modal title={x('cfNew')} onClose={onClose}>
      <select value={type} onChange={(e) => setType(e.target.value as RuleType)} className="mb-2 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm">{types.map((tt) => <option key={tt} value={tt}>{x(`cf_${tt}`)}</option>)}</select>
      {!['blank', 'dup'].includes(type) && <input value={a} onChange={(e) => setA(e.target.value)} placeholder={x('cfValue')} className="mb-2 h-9 w-full rounded border border-[var(--color-border)] bg-transparent px-2 text-sm outline-none" />}
      {type === 'between' && <input value={b} onChange={(e) => setB(e.target.value)} placeholder={x('cfValue2')} className="mb-2 h-9 w-full rounded border border-[var(--color-border)] bg-transparent px-2 text-sm outline-none" />}
      <div className="mb-4 flex items-center gap-4 text-xs"><label className="flex items-center gap-2">{x('cfFill')}<input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label><label className="flex items-center gap-2">{x('cfText')}<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label></div>
      <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>{x('cancel')}</Button><Button size="sm" onClick={() => onOk({ type, a, b, bg, color })}>OK</Button></div>
    </Modal>
  )
}

function FilterPopup({ x, d, sheet, calc, si, onClose, onApply, onClear, onSort }: {
  x: (k: string) => string; d: { col: number; x: number; y: number }; sheet: Sheet; calc: Calc; si: number
  onClose: () => void; onApply: (allowed: string[] | null) => void; onClear: () => void; onSort: (asc: boolean) => void
}) {
  const f = sheet.filter!
  const values = useMemo(() => {
    const set = new Set<string>()
    for (let r = f.range.r1 + 1; r <= f.range.r2; r++) set.add(formatValue(calc.value(si, r, d.col), sheet.cells[key(r, d.col)]?.s?.fmt).text)
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [f.range, calc, si, d.col, sheet.cells])
  const [checked, setChecked] = useState<Set<string>>(new Set(f.allowed[d.col] ?? values))
  const [q, setQ] = useState('')
  return (
    <PopMenu pos={{ x: d.x, y: d.y }} onClose={onClose}>
      {() => (
        <div className="text-xs">
          <MenuItem onClick={() => { onSort(true); onClose() }}>{x('sortAsc')}</MenuItem>
          <MenuItem onClick={() => { onSort(false); onClose() }}>{x('sortDesc')}</MenuItem>
          <div className="my-1 h-px bg-[var(--color-border)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={x('search')} className="mb-1 h-7 w-full rounded border border-[var(--color-border)] bg-transparent px-2 outline-none" />
          <label className="flex items-center gap-2 px-1 py-1"><input type="checkbox" checked={checked.size === values.length} onChange={(e) => setChecked(e.target.checked ? new Set(values) : new Set())} />{x('selectAll')}</label>
          <div className="max-h-48 overflow-auto">
            {values.filter((v) => v.toLowerCase().includes(q.toLowerCase())).map((v) => (
              <label key={v} className="flex items-center gap-2 px-1 py-0.5"><input type="checkbox" checked={checked.has(v)} onChange={(e) => setChecked((s) => { const n = new Set(s); e.target.checked ? n.add(v) : n.delete(v); return n })} /><span className="truncate">{v || x('blanks')}</span></label>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-1.5"><Button size="xs" variant="secondary" onClick={() => { onClear(); onClose() }}>{x('clearFilter')}</Button><Button size="xs" onClick={() => { onApply(checked.size === values.length ? null : [...checked]); if (checked.size === values.length) onClear(); onClose() }}>OK</Button></div>
        </div>
      )}
    </PopMenu>
  )
}

const sheetRef = (n: string) => (/^[A-Za-z_][\w.]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`)

function ValidationDialog({ x, current, onClose, onOk }: { x: (k: string) => string; current?: { type: 'list' | 'whole' | 'decimal'; items?: string[]; min?: number; max?: number }; onClose: () => void; onOk: (v: { type: 'list' | 'whole' | 'decimal'; items?: string[]; min?: number; max?: number } | null) => void }) {
  const [type, setType] = useState<'list' | 'whole' | 'decimal'>(current?.type ?? 'list')
  const [items, setItems] = useState((current?.items ?? []).join(', '))
  const [min, setMin] = useState(current?.min?.toString() ?? '')
  const [max, setMax] = useState(current?.max?.toString() ?? '')
  const inp = 'mb-2 h-9 w-full rounded border border-[var(--color-border)] bg-transparent px-2 text-sm outline-none'
  return (
    <Modal title={x('validation')} onClose={onClose}>
      <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="mb-2 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm">
        <option value="list">{x('val_list')}</option><option value="whole">{x('val_whole')}</option><option value="decimal">{x('val_decimal')}</option>
      </select>
      {type === 'list' ? <input value={items} onChange={(e) => setItems(e.target.value)} placeholder={x('val_items')} className={inp} /> : (
        <div className="flex gap-2"><input value={min} onChange={(e) => setMin(e.target.value)} placeholder={x('val_min')} className={inp} /><input value={max} onChange={(e) => setMax(e.target.value)} placeholder={x('val_max')} className={inp} /></div>
      )}
      <div className="mt-2 flex justify-between">
        <Button size="sm" variant="secondary" onClick={() => onOk(null)}>{x('val_clear')}</Button>
        <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={onClose}>{x('cancel')}</Button>
          <Button size="sm" onClick={() => onOk(type === 'list' ? { type, items: items.split(/[;,]/).map((i) => i.trim()).filter(Boolean) } : { type, min: min === '' ? undefined : Number(min), max: max === '' ? undefined : Number(max) })}>OK</Button></div>
      </div>
    </Modal>
  )
}

function PivotDialog({ x, headers, onClose, onOk }: { x: (k: string) => string; headers: { c: number; name: string }[]; onClose: () => void; onOk: (o: { row: number; col: number | null; val: number; agg: 'SUM' | 'COUNT' | 'AVERAGE' }) => void }) {
  const [row, setRow] = useState(headers[0]?.c ?? 0)
  const [col, setCol] = useState<number | null>(null)
  const [val, setVal] = useState(headers[1]?.c ?? headers[0]?.c ?? 0)
  const [agg, setAgg] = useState<'SUM' | 'COUNT' | 'AVERAGE'>('SUM')
  const sel = 'mb-2 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm'
  const opts = headers.map((h) => <option key={h.c} value={h.c}>{h.name}</option>)
  return (
    <Modal title={x('pivot')} onClose={onClose}>
      <p className="mb-2 text-xs text-[var(--color-text-muted)]">{x('pivotHint')}</p>
      <label className="text-xs">{x('pivotRows')}<select value={row} onChange={(e) => setRow(Number(e.target.value))} className={sel}>{opts}</select></label>
      <label className="text-xs">{x('pivotCols')}<select value={col ?? ''} onChange={(e) => setCol(e.target.value === '' ? null : Number(e.target.value))} className={sel}><option value="">—</option>{opts}</select></label>
      <label className="text-xs">{x('pivotValues')}<select value={val} onChange={(e) => setVal(Number(e.target.value))} className={sel}>{opts}</select></label>
      <label className="text-xs">{x('pivotAgg')}<select value={agg} onChange={(e) => setAgg(e.target.value as typeof agg)} className={sel}><option value="SUM">{x('agg_SUM')}</option><option value="COUNT">{x('agg_COUNT')}</option><option value="AVERAGE">{x('agg_AVERAGE')}</option></select></label>
      <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>{x('cancel')}</Button><Button size="sm" onClick={() => onOk({ row, col, val, agg })}>OK</Button></div>
    </Modal>
  )
}

void Calendar
