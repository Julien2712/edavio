import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from '@/workspace/tabRouter'
import {
  AlignCenter, AlignHorizontalDistributeCenter, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart,
  AlignJustify, AlignLeft, AlignRight, AlignVerticalDistributeCenter, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart, ArrowDown, ArrowRight, ArrowUp, Bold, BringToFront, ChevronDown, ChevronUp, Copy, Download, Eraser, FilePlus2,
  FlipHorizontal2, FlipVertical2, Highlighter, ImagePlus, IndentDecrease, IndentIncrease, Italic, Layers, LayoutTemplate, List, ListOrdered,
  Maximize, Minus, PaintBucket, Palette, PenLine, Play, Plus, Presentation, Redo2, RotateCw, Save, SendToBack, Contrast, Shapes, Slash, Strikethrough,
  Table2, Trash2, Type, Underline, Undo2, Upload, X, ZoomIn, ZoomOut, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_H, DEFAULT_W, GEOM_GROUPS, LAYOUT_IDS, THEMES, PX_PER_PT, boundsOf, cloneEl, geomPath, layoutElements, newImage, newShape, newTable,
  newTextBox, uid, type Align, type Deck, type GeomKind, type LayoutId, type ShapeEl, type Slide, type SlideEl, type TableEl, type Theme, type VAlign,
} from './model'
import { SLIDE_CSS, SlideView, ElementView, type ElementHooks } from './SlideView'
import { ColorMenu, FontPicker, Menu, MenuItem, MenuTitle, Sep, SizeField, Tb } from './ui'
import { domToParas, exec, execFontSize, formatAtSelection, formatOfEl, mapRuns, selectedBlocks, type Format } from './richText'
import { importPptx } from './pptxImport'
import { exportPptx } from './pptxExport'
import { DEFAULT_FONT } from './model'
import { useTabBridge } from '@/workspace/useTabBridge'
import { isProjectFile, type ProjectFile } from '@/workspace/project'

// ── state ─────────────────────────────────────────────────────────────────────

interface Doc { title: string; w: number; h: number; slides: Slide[]; past: Slide[][]; future: Slide[][] }

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}
function themeForBg(bg: string): Theme {
  return THEMES.find((t) => t.bg === bg) ?? (luminance(bg) < 0.5 ? THEMES[1]! : THEMES[0]!)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Record<Handle, [number, number]> = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] }
const HANDLE_CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

type Tool = { type: 'text' } | { type: 'shape'; geom: GeomKind } | null

type Drag =
  | { mode: 'move'; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; box: { x: number; y: number; w: number; h: number }; moved: boolean }
  | { mode: 'resize'; id: string; handle: Handle; start: { x: number; y: number }; orig: SlideEl; moved: boolean; keep: boolean }
  | { mode: 'rotate'; id: string; orig: SlideEl; moved: boolean }
  | { mode: 'marquee'; start: { x: number; y: number }; additive: boolean; base: string[] }
  | { mode: 'draw'; id: string; start: { x: number; y: number }; tool: NonNullable<Tool>; moved: boolean }

// ── page ──────────────────────────────────────────────────────────────────────

export default function PresentationEditorPage() {
  const { t } = useTranslation()
  const s = useCallback((k: string, o?: Record<string, unknown>) => (t as unknown as (k: string, o?: unknown) => string)(`slides.${k}`, o), [t])
  const location = useLocation()
  const navigate = useNavigate()

  const [doc, setDocState] = useState<Doc | null>(null)
  const docRef = useRef<Doc | null>(null)
  const setDoc = useCallback((d: Doc | null) => {
    docRef.current = d
    setDocState(d)
  }, [])

  const [slideIdx, setSlideIdx] = useState(0)
  const [sel, setSel] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>(null)
  const [tab, setTab] = useState<'home' | 'insert' | 'design' | 'view'>('home')
  const [fit, setFit] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [avail, setAvail] = useState({ w: 800, h: 500 })
  const [snap, setSnap] = useState(true)
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [presenting, setPresenting] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fmt, setFmt] = useState<Format | null>(null)
  const [dragOverThumb, setDragOverThumb] = useState<number | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const textRoot = useRef<HTMLDivElement | null>(null)
  const lastRange = useRef<Range | null>(null)
  const drag = useRef<Drag | null>(null)
  const clip = useRef<SlideEl[]>([])
  const lastKey = useRef<{ key: string; at: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const imgInput = useRef<HTMLInputElement>(null)
  const bgInput = useRef<HTMLInputElement>(null)

  const slide = doc?.slides[slideIdx]

  const { saveProject, openProjectFile } = useTabBridge({
    hasContent: doc !== null,
    title: doc?.title,
    getProject: (): ProjectFile => {
      const d = docRef.current!
      return { app: 'edavio', version: 1, kind: 'presentation', title: d.title, savedAt: new Date().toISOString(), data: { title: d.title, w: d.w, h: d.h, slides: d.slides } }
    },
  })
  const selEls = useMemo(() => (slide ? slide.elements.filter((e) => sel.includes(e.id)) : []), [slide, sel])

  // ── history ─────────────────────────────────────────────────────────────────

  const commit = useCallback((fn: (slides: Slide[]) => Slide[], key?: string) => {
    const d = docRef.current
    if (!d) return
    const next = fn(d.slides)
    if (next === d.slides) return
    const now = Date.now()
    const coalesce = !!key && lastKey.current?.key === key && now - lastKey.current.at < 1200
    lastKey.current = key ? { key, at: now } : null
    setDoc({ ...d, slides: next, past: coalesce ? d.past : [...d.past.slice(-80), d.slides], future: [] })
  }, [setDoc])

  const live = useCallback((fn: (slides: Slide[]) => Slide[]) => {
    const d = docRef.current
    if (d) setDoc({ ...d, slides: fn(d.slides) })
  }, [setDoc])

  const pushPast = useCallback(() => {
    const d = docRef.current
    if (d) setDoc({ ...d, past: [...d.past.slice(-80), d.slides], future: [] })
  }, [setDoc])

  const undo = useCallback(() => {
    const d = docRef.current
    if (!d || !d.past.length) return
    const prev = d.past[d.past.length - 1]!
    lastKey.current = null
    setDoc({ ...d, slides: prev, past: d.past.slice(0, -1), future: [d.slides, ...d.future] })
    setSlideIdx((i) => Math.min(i, prev.length - 1))
    setSel([])
    setEditingId(null)
  }, [setDoc])

  const redo = useCallback(() => {
    const d = docRef.current
    if (!d || !d.future.length) return
    const nxt = d.future[0]!
    lastKey.current = null
    setDoc({ ...d, slides: nxt, past: [...d.past, d.slides], future: d.future.slice(1) })
    setSlideIdx((i) => Math.min(i, nxt.length - 1))
    setSel([])
    setEditingId(null)
  }, [setDoc])

  /** Edit elements of the current slide */
  const patchEls = useCallback((ids: string[], fn: (el: SlideEl) => SlideEl, key?: string) => {
    commit((slides) => slides.map((sl, i) => (i === slideIdx ? { ...sl, elements: sl.elements.map((e) => (ids.includes(e.id) && !e.locked ? fn(e) : e)) } : sl)), key)
  }, [commit, slideIdx])

  const patchSlide = useCallback((fn: (sl: Slide) => Slide, key?: string) => {
    commit((slides) => slides.map((sl, i) => (i === slideIdx ? fn(sl) : sl)), key)
  }, [commit, slideIdx])

  // ── loading ─────────────────────────────────────────────────────────────────

  const newDeck = useCallback(() => {
    const theme = THEMES[0]!
    const els = layoutElements('title', theme, DEFAULT_W, DEFAULT_H, { title: s('defaultTitle'), subtitle: s('defaultSubtitle') })
    setDoc({ title: s('untitled'), w: DEFAULT_W, h: DEFAULT_H, slides: [{ id: uid(), bg: theme.bg, elements: els }], past: [], future: [] })
    setSlideIdx(0)
    setSel([])
  }, [s, setDoc])

  const openFile = useCallback(async (file: File) => {
    if (isProjectFile(file)) {
      try { await openProjectFile(file) } catch { setError(s('loadError')) }
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { deck, warnings } = await importPptx(file)
      setDoc({ title: deck.title, w: deck.w, h: deck.h, slides: deck.slides, past: [], future: [] })
      setSlideIdx(0)
      setSel([])
      setEditingId(null)
      if (warnings.length) setNotice(s('importWarning'))
    } catch (e) {
      console.error(e)
      setError(s('loadError'))
    } finally {
      setBusy(false)
    }
  }, [s, setDoc, openProjectFile])

  useEffect(() => {
    const st = location.state as { file?: File; newBlank?: boolean; project?: ProjectFile } | null
    if (st?.project) {
      const d = st.project.data as { title: string; w: number; h: number; slides: Slide[] }
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => { setDoc({ title: d.title, w: d.w, h: d.h, slides: d.slides, past: [], future: [] }); setSlideIdx(0); setSel([]) })
    } else if (st?.file) {
      const f = st.file
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => void openFile(f))
    } else if (st?.newBlank) {
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(newDeck)
    }
  }, [location.state, location.pathname, navigate, openFile, newDeck])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(id)
  }, [notice])

  // ── view / zoom ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setAvail({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [doc !== null])

  const scale = doc ? (fit ? Math.max(0.1, Math.min((avail.w - 48) / doc.w, (avail.h - 48) / doc.h)) : zoom / 100) : 1

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setFit(false)
      setZoom((z) => clamp(Math.round((fit ? scale * 100 : z) * (e.deltaY < 0 ? 1.1 : 0.9)), 10, 400))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [fit, scale, doc !== null])

  // ── text editing ────────────────────────────────────────────────────────────

  const commitText = useCallback(() => {
    const root = textRoot.current
    const id = editingIdRef.current
    if (!root || !id) return
    const paras = domToParas(root)
    commit((slides) => slides.map((sl, i) => (i === slideIdxRef.current ? { ...sl, elements: sl.elements.map((e) => (e.id === id && e.kind === 'shape' ? { ...e, paras } : e)) } : sl)), `text:${id}`)
  }, [commit])

  const editingIdRef = useRef<string | null>(null)
  const slideIdxRef = useRef(0)
  editingIdRef.current = editingId
  slideIdxRef.current = slideIdx

  const stopEditing = useCallback(() => {
    const id = editingIdRef.current
    if (!id) return
    commitText()
    setEditingId(null)
    textRoot.current = null
    // an empty, unstyled text box disappears like in PowerPoint
    const d = docRef.current
    const el = d?.slides[slideIdxRef.current]?.elements.find((e) => e.id === id)
    if (el && el.kind === 'shape' && !el.fill && !el.line && el.geom === 'rect' && !el.paras.some((p) => p.runs.some((r) => r.text.trim()))) {
      commit((slides) => slides.map((sl, i) => (i === slideIdxRef.current ? { ...sl, elements: sl.elements.filter((e) => e.id !== id) } : sl)))
      setSel([])
    }
  }, [commit, commitText])

  useEffect(() => {
    const onSel = () => {
      const root = textRoot.current
      if (!root) return
      const sl = window.getSelection()
      if (sl && sl.rangeCount && root.contains(sl.anchorNode)) {
        lastRange.current = sl.getRangeAt(0).cloneRange()
        setFmt(formatAtSelection(root))
      }
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  const hooks: ElementHooks = useMemo(
    () => ({
      editingId,
      onTextRoot: (r) => { textRoot.current = r },
      onTextInput: commitText,
      onCell: (id, r, c, text) => commit((slides) => slides.map((sl, i) => (i === slideIdxRef.current ? { ...sl, elements: sl.elements.map((e) => (e.id === id && e.kind === 'table' && e.rows[r]?.[c]?.text !== text ? { ...e, rows: e.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? { ...cell, text } : cell)) : row)) } : e)) } : sl)), `cell:${id}`),
    }),
    [editingId, commitText, commit],
  )

  const startEditing = useCallback((id: string) => {
    setSel([id])
    setEditingId(id)
  }, [])

  /** Runs a command on the live text editor, restoring the selection it had before the toolbar was used. */
  const withEditor = useCallback((fn: (root: HTMLElement) => void) => {
    const root = textRoot.current
    if (!root) return
    if (document.activeElement !== root) {
      root.focus()
      const sl = window.getSelection()
      if (lastRange.current && sl) {
        sl.removeAllRanges()
        sl.addRange(lastRange.current)
      }
    }
    fn(root)
    commitText()
    const sl = window.getSelection()
    if (sl && sl.rangeCount) lastRange.current = sl.getRangeAt(0).cloneRange()
    setFmt(formatAtSelection(root))
  }, [commitText])

  // ── formatting (works on live text when editing, else on the selected shapes) ─

  const shapesSel = selEls.filter((e): e is ShapeEl => e.kind === 'shape' && e.geom !== 'line')
  const tablesSel = selEls.filter((e): e is TableEl => e.kind === 'table')
  const editing = editingId !== null && textRoot.current !== null

  const current: Format = useMemo(() => {
    if (editing && fmt) return fmt
    const sh = shapesSel[0]
    if (sh) return formatOfEl(sh)
    const tb = tablesSel[0]
    if (tb) return { bold: !!tb.rows[0]?.[0]?.bold, italic: false, underline: false, strike: false, font: tb.font, size: tb.fontSize, color: tb.rows[0]?.[0]?.color ?? '#1f2937' }
    return { bold: false, italic: false, underline: false, strike: false, font: DEFAULT_FONT, size: 18, color: '#1f2937' }
  }, [editing, fmt, shapesSel, tablesSel])

  const setRuns = useCallback((patch: Partial<import('./model').Run>, toggleKey?: 'bold' | 'italic' | 'underline' | 'strike', baseKey?: 'size' | 'color' | 'font') => {
    const ids = [...shapesSel.map((e) => e.id), ...tablesSel.map((e) => e.id)]
    if (!ids.length) return
    const on = toggleKey ? !shapesSel.every((e) => e.paras.some((p) => p.runs.length) && e.paras.every((p) => p.runs.every((r) => r[toggleKey]))) : false
    patchEls(ids, (e) => {
      if (e.kind === 'table') {
        const p = patch
        return {
          ...e,
          fontSize: p.size ?? e.fontSize,
          font: p.font ?? e.font,
          rows: e.rows.map((row) => row.map((c) => ({ ...c, color: p.color ?? c.color, bold: toggleKey === 'bold' ? on : c.bold }))),
        }
      }
      if (e.kind !== 'shape') return e
      const p = toggleKey ? { [toggleKey]: on || undefined } : patch
      return { ...e, paras: mapRuns(e.paras, (r) => ({ ...r, ...p })), base: baseKey && patch[baseKey] !== undefined ? { ...e.base, [baseKey]: patch[baseKey] } : e.base }
    })
  }, [shapesSel, tablesSel, patchEls])

  const toggle = (k: 'bold' | 'italic' | 'underline' | 'strike') => {
    if (editing) withEditor(() => exec(k === 'strike' ? 'strikeThrough' : k))
    else setRuns({}, k)
  }
  const setColor = (c: string | null) => {
    const col = c ?? '#000000'
    if (editing) withEditor(() => exec('foreColor', col))
    else setRuns({ color: col }, undefined, 'color')
  }
  const setHighlight = (c: string | null) => {
    if (editing) withEditor(() => exec('hiliteColor', c ?? 'transparent'))
    else setRuns({ highlight: c ?? undefined })
  }
  const setFont = (f: string) => {
    if (editing) withEditor(() => exec('fontName', f))
    else setRuns({ font: f }, undefined, 'font')
  }
  const setSize = (n: number) => {
    if (editing) withEditor((root) => execFontSize(root, n))
    else setRuns({ size: n }, undefined, 'size')
  }
  const clearFormat = () => {
    if (editing) withEditor(() => exec('removeFormat'))
    else patchEls(shapesSel.map((e) => e.id), (e) => (e.kind === 'shape' ? { ...e, paras: e.paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ text: r.text })) })) } : e))
  }

  type ParaKind = 'align' | 'bullet' | 'indent' | 'spacing'
  const paraOp = (kind: ParaKind, value: string | number) => {
    if (tablesSel.length && kind === 'align') {
      patchEls(tablesSel.map((e) => e.id), (e) => (e.kind === 'table' ? { ...e, rows: e.rows.map((r) => r.map((c) => ({ ...c, align: value as Align }))) } : e))
      return
    }
    if (editing) {
      withEditor((root) => {
        for (const b of selectedBlocks(root)) {
          if (kind === 'align') b.style.textAlign = String(value)
          if (kind === 'bullet') {
            if (b.dataset.b === value) delete b.dataset.b
            else b.dataset.b = String(value)
          }
          if (kind === 'indent') {
            const l = clamp(Number(b.dataset.l ?? 0) + Number(value), 0, 6)
            if (l) b.dataset.l = String(l)
            else delete b.dataset.l
            b.style.marginLeft = l ? `${l * 1.5}em` : ''
          }
          if (kind === 'spacing') b.style.lineHeight = String(Number(value) * 1.2)
        }
      })
      return
    }
    patchEls(shapesSel.map((e) => e.id), (e) =>
      e.kind !== 'shape' ? e : {
        ...e,
        paras: (e.paras.length ? e.paras : [{ runs: [] }]).map((p) => {
          if (kind === 'align') return { ...p, align: value as Align }
          if (kind === 'bullet') return { ...p, bullet: p.bullet === value ? 'none' : (value as 'bullet' | 'number') }
          if (kind === 'indent') return { ...p, level: clamp((p.level ?? 0) + Number(value), 0, 6) || undefined }
          return { ...p, lineSpacing: Number(value) * 1.2 }
        }),
      })
  }

  const paraCurrent = useMemo(() => {
    const p = shapesSel[0]?.paras[0]
    return { align: p?.align ?? 'left', bullet: p?.bullet ?? 'none' }
  }, [shapesSel])

  const setValign = (v: VAlign) => patchEls(shapesSel.map((e) => e.id), (e) => (e.kind === 'shape' ? { ...e, valign: v } : e))
  const patchShapes = (patch: Partial<ShapeEl>) => patchEls(shapesSel.concat(selEls.filter((e): e is ShapeEl => e.kind === 'shape' && e.geom === 'line')).map((e) => e.id), (e) => (e.kind === 'shape' ? { ...e, ...patch } : e))
  const anyShape = selEls.find((e): e is ShapeEl => e.kind === 'shape')

  // ── element / slide operations ──────────────────────────────────────────────

  const addElements = useCallback((els: SlideEl[]) => {
    patchSlide((sl) => ({ ...sl, elements: [...sl.elements, ...els] }))
    setSel(els.map((e) => e.id))
  }, [patchSlide])

  const deleteSel = useCallback(() => {
    if (!sel.length) return
    patchSlide((sl) => ({ ...sl, elements: sl.elements.filter((e) => !sel.includes(e.id) || e.locked) }))
    setSel([])
  }, [sel, patchSlide])

  const duplicateSel = useCallback(() => {
    if (!slide) return
    const copies = slide.elements.filter((e) => sel.includes(e.id)).map((e) => cloneEl(e, 24, 24))
    if (copies.length) addElements(copies)
  }, [slide, sel, addElements])

  const copySel = useCallback(() => {
    if (slide) clip.current = slide.elements.filter((e) => sel.includes(e.id))
  }, [slide, sel])

  const paste = useCallback(() => {
    if (!clip.current.length) return
    addElements(clip.current.map((e) => cloneEl(e, 24, 24)))
    clip.current = clip.current.map((e) => cloneEl(e, 24, 24))
  }, [addElements])

  const order = (mode: 'front' | 'back' | 'forward' | 'backward') => {
    patchSlide((sl) => {
      const els = [...sl.elements]
      const picked = els.filter((e) => sel.includes(e.id))
      const rest = els.filter((e) => !sel.includes(e.id))
      if (mode === 'front') return { ...sl, elements: [...rest, ...picked] }
      if (mode === 'back') {
        const locked = rest.filter((e) => e.locked)
        return { ...sl, elements: [...locked, ...picked, ...rest.filter((e) => !e.locked)] }
      }
      const out = [...els]
      const idxs = out.map((e, i) => (sel.includes(e.id) ? i : -1)).filter((i) => i >= 0)
      if (mode === 'forward') for (const i of [...idxs].reverse()) { if (i < out.length - 1 && !sel.includes(out[i + 1]!.id)) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!] }
      else for (const i of idxs) { if (i > 0 && !sel.includes(out[i - 1]!.id) && !out[i - 1]!.locked) [out[i], out[i - 1]] = [out[i - 1]!, out[i]!] }
      return { ...sl, elements: out }
    })
  }

  const alignSel = (mode: 'l' | 'c' | 'r' | 't' | 'm' | 'b') => {
    if (!doc || !selEls.length) return
    const box = selEls.length > 1 ? boundsOf(selEls) : { x0: 0, y0: 0, x1: doc.w, y1: doc.h, w: doc.w, h: doc.h }
    patchEls(sel, (e) => ({
      ...e,
      x: mode === 'l' ? box.x0 : mode === 'c' ? box.x0 + (box.w - e.w) / 2 : mode === 'r' ? box.x1 - e.w : e.x,
      y: mode === 't' ? box.y0 : mode === 'm' ? box.y0 + (box.h - e.h) / 2 : mode === 'b' ? box.y1 - e.h : e.y,
    }))
  }

  const distribute = (axis: 'h' | 'v') => {
    if (selEls.length < 3) return
    const sorted = [...selEls].sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y))
    const first = sorted[0]!, last = sorted[sorted.length - 1]!
    const total = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y
    const used = sorted.reduce((a, e) => a + (axis === 'h' ? e.w : e.h), 0)
    const gap = (total - used) / (sorted.length - 1)
    const pos = new Map<string, number>()
    let cur = axis === 'h' ? first.x : first.y
    for (const e of sorted) {
      pos.set(e.id, cur)
      cur += (axis === 'h' ? e.w : e.h) + gap
    }
    patchEls(sel, (e) => (axis === 'h' ? { ...e, x: pos.get(e.id) ?? e.x } : { ...e, y: pos.get(e.id) ?? e.y }))
  }

  const addSlide = useCallback((layout: LayoutId) => {
    const d = docRef.current
    if (!d) return
    const cur = d.slides[slideIdx]
    const theme = themeForBg(cur?.bg ?? '#ffffff')
    const els = layoutElements(layout, theme, d.w, d.h, {
      title: s('defaultTitle'), subtitle: s('defaultSubtitle'), heading: s('slideHeading'), body: s('slideBody'),
    })
    const ns: Slide = { id: uid(), bg: cur?.bg ?? theme.bg, bgImage: cur?.bgImage, elements: els }
    commit((slides) => [...slides.slice(0, slideIdx + 1), ns, ...slides.slice(slideIdx + 1)])
    setSlideIdx(slideIdx + 1)
    setSel([])
  }, [commit, s, slideIdx])

  const duplicateSlide = () => {
    if (!slide) return
    const copy: Slide = { ...slide, id: uid(), elements: slide.elements.map((e) => ({ ...e, id: uid() })) }
    commit((slides) => [...slides.slice(0, slideIdx + 1), copy, ...slides.slice(slideIdx + 1)])
    setSlideIdx(slideIdx + 1)
    setSel([])
  }

  const deleteSlide = () => {
    if (!doc) return
    if (doc.slides.length === 1) {
      patchSlide((sl) => ({ ...sl, elements: [] }))
      return
    }
    commit((slides) => slides.filter((_, i) => i !== slideIdx))
    setSlideIdx((i) => Math.max(0, Math.min(i, doc.slides.length - 2)))
    setSel([])
  }

  const moveSlide = (from: number, to: number) => {
    if (!doc || from === to || to < 0 || to >= doc.slides.length) return
    commit((slides) => {
      const arr = [...slides]
      const [m] = arr.splice(from, 1)
      arr.splice(to, 0, m!)
      return arr
    })
    setSlideIdx(to)
  }

  const insertImage = useCallback(async (file: File) => {
    const d = docRef.current
    if (!d) return
    const src = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.onerror = rej
      r.readAsDataURL(file)
    })
    const img = new Image()
    img.src = src
    await img.decode().catch(() => undefined)
    const k = Math.min(1, (d.w * 0.6) / (img.naturalWidth || 400), (d.h * 0.6) / (img.naturalHeight || 300))
    const w = (img.naturalWidth || 400) * k
    const h = (img.naturalHeight || 300) * k
    addElements([newImage(src, (d.w - w) / 2, (d.h - h) / 2, w, h)])
  }, [addElements])

  const setBgImage = async (file: File) => {
    const src = await new Promise<string>((res) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.readAsDataURL(file)
    })
    patchSlide((sl) => ({ ...sl, bgImage: src }))
  }

  const applyTheme = (th: Theme, all: boolean) => {
    const textColors = new Set([...THEMES.map((x) => x.text.toLowerCase()), '#1f2937', '#000000', '#0f172a'])
    const recolor = (sl: Slide): Slide => ({
      ...sl, bg: th.bg, bgImage: undefined,
      elements: sl.elements.map((e) => {
        if (e.kind !== 'shape') return e
        const sw = (c: string | undefined) => (c && textColors.has(c.toLowerCase()) ? th.text : c)
        return { ...e, base: { ...e.base, color: sw(e.base.color)! }, paras: mapRuns(e.paras, (r) => ({ ...r, color: sw(r.color) })), fill: e.fill && THEMES.some((x) => x.accent === e.fill) ? th.accent : e.fill }
      }),
    })
    commit((slides) => slides.map((sl, i) => (all || i === slideIdx ? recolor(sl) : sl)))
  }

  const resizeDeck = (w: number, h: number) => {
    const d = docRef.current
    if (!d || (d.w === w && d.h === h)) return
    const kx = w / d.w, ky = h / d.h
    const k = Math.min(kx, ky)
    pushPast()
    const nd = docRef.current!
    setDoc({
      ...nd, w, h,
      slides: nd.slides.map((sl) => ({
        ...sl,
        elements: sl.elements.map((e) => ({ ...e, x: e.x * kx, y: e.y * ky, w: e.w * kx, h: e.h * ky, ...(e.kind === 'table' ? { colW: (e as TableEl).colW.map((c) => c * kx), rowH: (e as TableEl).rowH * ky } : {}), ...(e.kind === 'shape' && k !== 1 ? { base: { ...e.base, size: e.base.size * k }, paras: mapRuns(e.paras, (r) => ({ ...r, size: r.size ? r.size * k : r.size })) } : {}) })) as SlideEl[],
      })),
    })
  }

  const doExport = async () => {
    if (!doc) return
    stopEditing()
    setBusy(true)
    try {
      const blob = await exportPptx({ title: doc.title, w: doc.w, h: doc.h, slides: docRef.current!.slides } as Deck)
      downloadBlob(blob, `${(doc.title || s('untitled')).trim()}.pptx`)
      setNotice(s('exportSuccess'))
    } catch (e) {
      console.error(e)
      setError(s('exportError'))
    } finally {
      setBusy(false)
    }
  }

  // ── pointer interaction on the stage ────────────────────────────────────────

  const toStage = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  const snapMove = (box: { x: number; y: number; w: number; h: number }, others: SlideEl[], dx: number, dy: number, w: number, h: number) => {
    const xs = [0, w / 2, w], ys = [0, h / 2, h]
    for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h) }
    const th = 6 / scale
    const bx = [box.x + dx, box.x + dx + box.w / 2, box.x + dx + box.w]
    const by = [box.y + dy, box.y + dy + box.h / 2, box.y + dy + box.h]
    let ax: number | null = null, ay: number | null = null
    let gx: number[] = [], gy: number[] = []
    for (const b of bx) for (const c of xs) { const d = c - b; if (Math.abs(d) < th && (ax === null || Math.abs(d) < Math.abs(ax))) { ax = d; gx = [c] } }
    for (const b of by) for (const c of ys) { const d = c - b; if (Math.abs(d) < th && (ay === null || Math.abs(d) < Math.abs(ay))) { ay = d; gy = [c] } }
    return { dx: dx + (ax ?? 0), dy: dy + (ay ?? 0), gx, gy }
  }

  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !doc || !slide) return
    const target = e.target as HTMLElement
    if (editingId) {
      if (target.closest(`[data-el="${editingId}"]`)) return
      stopEditing()
    }
    const p = toStage(e)
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle') as Handle | 'rot' | null
    const id = target.closest('[data-el]')?.getAttribute('data-el') ?? null

    const begin = (d: Drag) => {
      drag.current = d
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    if (tool) {
      const base = tool.type === 'text'
        ? newTextBox(p.x, p.y, 1, 1, '', { size: 24, color: themeForBg(slide.bg).text })
        : newShape({ x: p.x, y: p.y, w: 1, h: 1, geom: tool.geom, fill: tool.geom === 'line' ? null : themeForBg(slide.bg).accent, line: tool.geom === 'line' ? themeForBg(slide.bg).text : null, lineW: tool.geom === 'line' ? 3 : 1, base: { size: 20, color: '#ffffff', font: DEFAULT_FONT }, valign: 'middle' })
      pushPast()
      live((slides) => slides.map((sl, i) => (i === slideIdx ? { ...sl, elements: [...sl.elements, base] } : sl)))
      setSel([base.id])
      begin({ mode: 'draw', id: base.id, start: p, tool, moved: false })
      return
    }
    if (handle && selEls.length === 1) {
      const el = selEls[0]!
      begin(handle === 'rot' ? { mode: 'rotate', id: el.id, orig: el, moved: false } : { mode: 'resize', id: el.id, handle, start: p, orig: el, moved: false, keep: el.kind === 'image' })
      return
    }
    if (id) {
      const el = slide.elements.find((x) => x.id === id)
      if (!el || el.locked) {
        if (!e.shiftKey) setSel([])
        begin({ mode: 'marquee', start: p, additive: e.shiftKey, base: e.shiftKey ? sel : [] })
        return
      }
      let next = sel
      if (e.shiftKey) {
        next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]
        setSel(next)
        if (!next.includes(id)) return
      } else if (!sel.includes(id)) {
        next = [id]
        setSel(next)
      }
      const moving = slide.elements.filter((x) => next.includes(x.id))
      const b = boundsOf(moving)
      begin({ mode: 'move', start: p, orig: new Map(moving.map((x) => [x.id, { x: x.x, y: x.y }])), box: { x: b.x0, y: b.y0, w: b.w, h: b.h }, moved: false })
      return
    }
    if (!e.shiftKey) setSel([])
    begin({ mode: 'marquee', start: p, additive: e.shiftKey, base: e.shiftKey ? sel : [] })
  }

  // refs so that window listeners always see fresh values
  const live2 = useRef({ scale, slideIdx, slide, sel, snap, doc })
  live2.current = { scale, slideIdx, slide, sel, snap, doc }

  const onMove = useCallback((e: PointerEvent) => {
    const dr = drag.current
    const { scale: sc, slideIdx: si, slide: sl, snap: sn, doc: dc } = live2.current
    if (!dr || !sl || !dc || !stageRef.current) return
    const r = stageRef.current.getBoundingClientRect()
    const p = { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc }
    const upd = (id: string, fn: (el: SlideEl) => SlideEl) =>
      live((slides) => slides.map((s2, i) => (i === si ? { ...s2, elements: s2.elements.map((el) => (el.id === id ? fn(el) : el)) } : s2)))

    if (dr.mode === 'move') {
      let dx = p.x - dr.start.x, dy = p.y - dr.start.y
      if (!dr.moved) {
        if (Math.hypot(dx, dy) * sc < 3) return
        dr.moved = true
        pushPast()
      }
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
      let gx: number[] = [], gy: number[] = []
      if (sn && !e.altKey) {
        const r2 = snapMove(dr.box, sl.elements.filter((x) => !dr.orig.has(x.id)), dx, dy, dc.w, dc.h)
        ;({ dx, dy, gx, gy } = r2)
      }
      setGuides({ x: gx, y: gy })
      live((slides) => slides.map((s2, i) => (i === si ? { ...s2, elements: s2.elements.map((el) => { const o = dr.orig.get(el.id); return o ? { ...el, x: o.x + dx, y: o.y + dy } : el }) } : s2)))
    } else if (dr.mode === 'resize') {
      if (!dr.moved) { dr.moved = true; pushPast() }
      const o = dr.orig
      const a = (o.rot * Math.PI) / 180
      const ddx = p.x - dr.start.x, ddy = p.y - dr.start.y
      const lx = ddx * Math.cos(a) + ddy * Math.sin(a)
      const ly = -ddx * Math.sin(a) + ddy * Math.cos(a)
      const [hx, hy] = HANDLES[dr.handle]
      let w = Math.max(8, o.w + hx * lx), h = Math.max(8, o.h + hy * ly)
      if ((dr.keep || e.shiftKey) && hx && hy) {
        const k = Math.max(w / o.w, h / o.h)
        w = o.w * k
        h = o.h * k
      }
      const dw = (w - o.w) * hx / 2, dh = (h - o.h) * hy / 2
      const cx = o.x + o.w / 2 + dw * Math.cos(a) - dh * Math.sin(a)
      const cy = o.y + o.h / 2 + dw * Math.sin(a) + dh * Math.cos(a)
      upd(dr.id, (el) => ({ ...el, w, h, x: cx - w / 2, y: cy - h / 2 }) as SlideEl)
    } else if (dr.mode === 'rotate') {
      if (!dr.moved) { dr.moved = true; pushPast() }
      const o = dr.orig
      let deg = (Math.atan2(p.y - (o.y + o.h / 2), p.x - (o.x + o.w / 2)) * 180) / Math.PI + 90
      if (e.shiftKey) deg = Math.round(deg / 15) * 15
      deg = ((Math.round(deg) % 360) + 360) % 360
      upd(dr.id, (el) => ({ ...el, rot: deg }))
    } else if (dr.mode === 'marquee') {
      const box = { x0: Math.min(dr.start.x, p.x), y0: Math.min(dr.start.y, p.y), x1: Math.max(dr.start.x, p.x), y1: Math.max(dr.start.y, p.y) }
      setMarquee(box)
      const hit = sl.elements.filter((el) => !el.locked && el.x < box.x1 && el.x + el.w > box.x0 && el.y < box.y1 && el.y + el.h > box.y0).map((el) => el.id)
      setSel([...new Set([...dr.base, ...hit])])
    } else if (dr.mode === 'draw') {
      dr.moved = true
      const geomLine = dr.tool.type === 'shape' && dr.tool.geom === 'line'
      let x = Math.min(dr.start.x, p.x), y = Math.min(dr.start.y, p.y)
      let w = Math.abs(p.x - dr.start.x), h = Math.abs(p.y - dr.start.y)
      if (e.shiftKey && !geomLine && dr.tool.type === 'shape') { w = h = Math.max(w, h); x = p.x < dr.start.x ? dr.start.x - w : dr.start.x; y = p.y < dr.start.y ? dr.start.y - h : dr.start.y }
      upd(dr.id, (el) => ({ ...el, x, y, w: Math.max(1, w), h: Math.max(geomLine ? 0 : 1, h), flipH: geomLine ? p.x < dr.start.x : undefined, flipV: geomLine ? p.y < dr.start.y : undefined }) as SlideEl)
    }
  }, [live, pushPast])

  const onUp = useCallback(() => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const dr = drag.current
    drag.current = null
    setGuides({ x: [], y: [] })
    setMarquee(null)
    if (!dr) return
    lastKey.current = null
    if (dr.mode === 'draw') {
      const { doc: dc, slideIdx: si } = live2.current
      const el = dc?.slides[si]?.elements.find((x) => x.id === dr.id)
      if (el && (el.w < 8 || (el.h < 8 && !(el.kind === 'shape' && el.geom === 'line')))) {
        const dw = dr.tool.type === 'text' ? 360 : 220, dh = dr.tool.type === 'text' ? 70 : dr.tool.type === 'shape' && dr.tool.geom === 'line' ? 0 : 140
        live((slides) => slides.map((s2, i) => (i === si ? { ...s2, elements: s2.elements.map((x) => (x.id === dr.id ? { ...x, x: dr.start.x - (dr.tool.type === 'text' ? 0 : dw / 2), y: dr.start.y - (dr.tool.type === 'text' ? 0 : dh / 2), w: dw, h: dr.tool.type === 'text' ? 56 : dh } : x)) } : s2)))
      } else if (el && dr.tool.type === 'text' && el.h < 40) {
        live((slides) => slides.map((s2, i) => (i === si ? { ...s2, elements: s2.elements.map((x) => (x.id === dr.id ? { ...x, h: 56 } : x)) } : s2)))
      }
      setTool(null)
      if (dr.tool.type === 'text' || (dr.tool.type === 'shape' && dr.tool.geom !== 'line')) {
        if (dr.tool.type === 'text') startEditing(dr.id)
      }
    }
  }, [live, onMove, startEditing])

  // ── keyboard / clipboard ────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!docRef.current || presenting !== null) return
      const tgt = ev.target as HTMLElement
      const inField = tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT'
      if (ev.key === 'Escape') {
        if (editingIdRef.current) stopEditing()
        else { setSel([]); setTool(null) }
        return
      }
      if (inField || editingIdRef.current || tgt.isContentEditable) return
      const mod = ev.ctrlKey || ev.metaKey
      const k = ev.key.toLowerCase()
      const cur = live2.current
      if (mod && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return }
      if (mod && k === 'y') { ev.preventDefault(); redo(); return }
      if (mod && k === 'a') { ev.preventDefault(); setSel(cur.slide?.elements.filter((e) => !e.locked).map((e) => e.id) ?? []); return }
      if (mod && k === 'c') { copySel(); return }
      if (mod && k === 'x') { copySel(); deleteSel(); return }
      if (mod && k === 'v') { if (clip.current.length) { ev.preventDefault(); paste() } return }
      if (mod && k === 'd') { ev.preventDefault(); duplicateSel(); return }
      if (mod && ['b', 'i', 'u'].includes(k)) { ev.preventDefault(); toggle(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline'); return }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { if (cur.sel.length) { ev.preventDefault(); deleteSel() } return }
      if (ev.key === 'Enter' && cur.sel.length === 1) {
        const el = cur.slide?.elements.find((e) => e.id === cur.sel[0])
        if (el && (el.kind === 'table' || (el.kind === 'shape' && el.geom !== 'line'))) { ev.preventDefault(); startEditing(el.id) }
        return
      }
      if (ev.key.startsWith('Arrow')) {
        if (cur.sel.length) {
          ev.preventDefault()
          const st = ev.shiftKey ? 10 : 1
          const dx = ev.key === 'ArrowLeft' ? -st : ev.key === 'ArrowRight' ? st : 0
          const dy = ev.key === 'ArrowUp' ? -st : ev.key === 'ArrowDown' ? st : 0
          patchEls(cur.sel, (e) => ({ ...e, x: e.x + dx, y: e.y + dy }), 'nudge')
        } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
          setSlideIdx((i) => clamp(i + (ev.key === 'ArrowDown' ? 1 : -1), 0, (docRef.current?.slides.length ?? 1) - 1))
        }
      }
    }
    const onPaste = (ev: ClipboardEvent) => {
      if (!docRef.current || editingIdRef.current) return
      const tgt = ev.target as HTMLElement
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') return
      const f = [...(ev.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'))
      if (f) { ev.preventDefault(); void insertImage(f) }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, copySel, deleteSel, paste, duplicateSel, patchEls, presenting, insertImage, stopEditing, startEditing])

  // ── render ──────────────────────────────────────────────────────────────────

  if (!doc || !slide) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-5 p-8">
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void openFile(f) }}
          className="group flex w-full max-w-md cursor-pointer select-none flex-col items-center gap-5 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]"
        >
          <div className="flex size-14 items-center justify-center rounded-xl bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)] group-hover:bg-[var(--color-accent)] group-hover:text-white">
            <Presentation className="size-6" aria-hidden />
          </div>
          <div className="text-center">
            <p className="text-base font-medium text-[var(--color-text-primary)]">{busy ? s('opening') : s('dropzone')}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white">
              <Upload className="size-4" />
              {s('browse')}
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-disabled)]">PPTX</p>
        </div>
        <Button variant="secondary" size="sm" onClick={newDeck} className="gap-2">
          <FilePlus2 className="size-4" />
          {s('newBlank')}
        </Button>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <input ref={fileInput} type="file" accept=".pptx,.edavio,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
      </div>
    )
  }

  const single = selEls.length === 1 ? selEls[0]! : null
  const box = selEls.length > 1 ? boundsOf(selEls) : null
  const hs = 10 / scale
  const stageW = doc.w * scale, stageH = doc.h * scale
  const canEditText = !!single && ((single.kind === 'shape' && single.geom !== 'line') || single.kind === 'table')

  const layoutLabel = (id: LayoutId) => s(`layout.${id}`)
  const LayoutMenu = (
    <Menu label={s('newSlide')} width={230} trigger={<span className="flex items-center gap-1.5"><LayoutTemplate size={16} />{s('newSlide')}</span>}>
      {(close) => (
        <div>
          <MenuTitle>{s('layouts')}</MenuTitle>
          {LAYOUT_IDS.map((id) => (
            <MenuItem key={id} onClick={() => { addSlide(id); close() }}>{layoutLabel(id)}</MenuItem>
          ))}
        </div>
      )}
    </Menu>
  )

  const shapePicker = (
    <Menu label={s('shapes')} width={280} trigger={<span className="flex items-center gap-1.5"><Shapes size={16} />{s('shapes')}</span>}>
      {(close) => (
        <div>
          {GEOM_GROUPS.map((g) => (
            <div key={g.id}>
              <MenuTitle>{s(`shapeGroup.${g.id}`)}</MenuTitle>
              <div className="grid grid-cols-6 gap-1">
                {g.items.map((geom) => (
                  <button key={geom} type="button" title={s(`geom.${geom}`)} onClick={() => { setTool({ type: 'shape', geom }); close() }}
                    className="flex size-9 items-center justify-center rounded-md hover:bg-[var(--color-surface-raised)]">
                    <svg width="22" height="22" viewBox="0 0 22 22"><GeomPreview geom={geom} /></svg>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Menu>
  )

  const tablePicker = (
    <Menu label={s('table')} width={190} trigger={<span className="flex items-center gap-1.5"><Table2 size={16} />{s('table')}</span>}>
      {(close) => <TableGrid label={s('tableInsert')} onPick={(r, c) => { addElements([newTable((doc.w - c * 150) / 2, doc.h * 0.3, r, c, themeForBg(slide.bg))]); close() }} />}
    </Menu>
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--color-surface-sunken)]">
      <style>{SLIDE_CSS}</style>

      {/* title bar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3">
        <Presentation size={18} className="shrink-0 text-[var(--color-accent)]" />
        <input
          value={doc.title}
          onChange={(e) => setDoc({ ...doc, title: e.target.value })}
          aria-label={s('titleLabel')}
          className="h-8 w-56 min-w-0 rounded-md bg-transparent px-2 text-sm font-medium text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-surface-raised)] focus:bg-[var(--color-surface-raised)]"
        />
        <Tb icon={Undo2} label={s('undo')} disabled={!doc.past.length} onClick={undo} />
        <Tb icon={Redo2} label={s('redo')} disabled={!doc.future.length} onClick={redo} />
        <div className="flex-1" />
        {notice && <span role="status" className="truncate text-xs text-[var(--color-text-secondary)]">{notice}</span>}
        {error && <span role="alert" className="truncate text-xs text-red-500">{error}</span>}
        <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()} className="gap-1.5"><Upload className="size-4" />{s('open')}</Button>
        <Button variant="secondary" size="sm" title={t('workspace.saveProjectHint')} onClick={() => { stopEditing(); void saveProject() }} className="gap-1.5"><Save className="size-4" />{t('workspace.saveProject')}</Button>
        <Button variant="secondary" size="sm" onClick={() => { stopEditing(); setPresenting(slideIdx) }} className="gap-1.5"><Play className="size-4" />{s('present')}</Button>
        <Button size="sm" onClick={() => void doExport()} disabled={busy} className="gap-1.5"><Download className="size-4" />{busy ? s('exporting') : s('export')}</Button>
        <input ref={fileInput} type="file" accept=".pptx,.edavio,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
        <input ref={imgInput} type="file" accept="image/*" className="sr-only" tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void insertImage(f) }} />
        <input ref={bgInput} type="file" accept="image/*" className="sr-only" tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void setBgImage(f) }} />
      </div>

      {/* ribbon */}
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-8 items-center gap-1 px-3" role="tablist">
          {(['home', 'insert', 'design', 'view'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
              className={cn('h-8 rounded-t-md px-3 text-xs font-medium', tab === k ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {s(`tab.${k}`)}
            </button>
          ))}
        </div>
        <div className="h-[84px] overflow-x-auto overflow-y-hidden px-3 pb-1">
          {tab === 'home' && (
            <div className="flex w-max flex-col gap-1 pt-1">
              <div className="flex flex-nowrap items-center gap-0.5">
                {LayoutMenu}
                <Sep />
                <FontPicker value={current.font} onPick={setFont} searchLabel={s('font')} />
                <SizeField value={current.size} onPick={setSize} label={s('size')} />
                <Sep />
                <Tb icon={Bold} label={s('bold')} active={current.bold} onClick={() => toggle('bold')} />
                <Tb icon={Italic} label={s('italic')} active={current.italic} onClick={() => toggle('italic')} />
                <Tb icon={Underline} label={s('underline')} active={current.underline} onClick={() => toggle('underline')} />
                <Tb icon={Strikethrough} label={s('strike')} active={current.strike} onClick={() => toggle('strike')} />
                <ColorMenu icon={Type} label={s('textColor')} value={current.color} onPick={setColor} />
                <ColorMenu icon={Highlighter} label={s('highlight')} value={null} onPick={setHighlight} noneLabel={s('none')} />
                <Tb icon={Eraser} label={s('clearFormat')} onClick={clearFormat} />
                <Sep />
                <Tb icon={Copy} label={s('duplicate')} disabled={!sel.length} onClick={duplicateSel} />
                <Tb icon={Trash2} label={s('delete')} disabled={!sel.length} onClick={deleteSel} />
                <ArrangeMenu s={s} disabled={!sel.length} multi={selEls.length > 1} order={order} align={alignSel} distribute={distribute}
                  rotate={() => patchEls(sel, (e) => ({ ...e, rot: (e.rot + 90) % 360 }))}
                  flipH={() => patchEls(sel, (e) => ({ ...e, flipH: !e.flipH }))} flipV={() => patchEls(sel, (e) => ({ ...e, flipV: !e.flipV }))} />
              </div>
              <div className="flex flex-nowrap items-center gap-0.5">
                {(['left', 'center', 'right', 'justify'] as const).map((a) => (
                  <Tb key={a} icon={{ left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify }[a]} label={s(`align.${a}`)} active={!editing && paraCurrent.align === a} onClick={() => paraOp('align', a)} />
                ))}
                <Sep />
                <Tb icon={AlignVerticalJustifyStart} label={s('valign.top')} active={shapesSel[0]?.valign === 'top'} onClick={() => setValign('top')} />
                <Tb icon={AlignVerticalJustifyCenter} label={s('valign.middle')} active={shapesSel[0]?.valign === 'middle'} onClick={() => setValign('middle')} />
                <Tb icon={AlignVerticalJustifyEnd} label={s('valign.bottom')} active={shapesSel[0]?.valign === 'bottom'} onClick={() => setValign('bottom')} />
                <Sep />
                <Tb icon={List} label={s('bullets')} active={!editing && paraCurrent.bullet === 'bullet'} onClick={() => paraOp('bullet', 'bullet')} />
                <Tb icon={ListOrdered} label={s('numbering')} active={!editing && paraCurrent.bullet === 'number'} onClick={() => paraOp('bullet', 'number')} />
                <Tb icon={IndentDecrease} label={s('outdent')} onClick={() => paraOp('indent', -1)} />
                <Tb icon={IndentIncrease} label={s('indent')} onClick={() => paraOp('indent', 1)} />
                <Menu label={s('lineSpacing')} width={120} trigger={<span className="text-[11px] font-medium">1.5×</span>}>
                  {(close) => <div>{[1, 1.15, 1.5, 2, 2.5, 3].map((v) => <MenuItem key={v} onClick={() => { paraOp('spacing', v); close() }}>{v}</MenuItem>)}</div>}
                </Menu>
                <Sep />
                <ColorMenu icon={PaintBucket} label={s('fill')} value={anyShape?.fill} noneLabel={s('noFill')} onPick={(c) => patchShapes({ fill: c })} />
                <ColorMenu icon={PenLine} label={s('outline')} value={anyShape?.line} noneLabel={s('noOutline')} onPick={(c) => patchShapes({ line: c, lineW: c && !anyShape?.lineW ? 2 : anyShape?.lineW ?? 1 })} />
                <Menu label={s('weight')} width={130} disabled={!anyShape} trigger={<Minus size={16} />}>
                  {(close) => <div>{[0.5, 1, 2, 3, 4, 6, 8].map((w) => <MenuItem key={w} active={anyShape?.lineW === w} onClick={() => { patchShapes({ lineW: w, line: anyShape?.line ?? themeForBg(slide.bg).text }); close() }}>{w} pt</MenuItem>)}</div>}
                </Menu>
                <Menu label={s('dash')} width={140} disabled={!anyShape} trigger={<Slash size={16} />}>
                  {(close) => <div>{(['solid', 'dash', 'dot'] as const).map((d) => <MenuItem key={d} active={(anyShape?.dash ?? 'solid') === d} onClick={() => { patchShapes({ dash: d }); close() }}>{s(`dashes.${d}`)}</MenuItem>)}</div>}
                </Menu>
                <Tb icon={Contrast} label={s('shadow')} active={!!anyShape?.shadow} disabled={!anyShape} onClick={() => patchShapes({ shadow: !anyShape?.shadow })} />
                <OpacityMenu s={s} el={single} onPick={(a) => patchEls(sel, (e) => (e.kind === 'image' ? { ...e, alpha: a } : e.kind === 'shape' ? { ...e, fillAlpha: a } : e))} />
                {tablesSel.length > 0 && <TableTools s={s} el={tablesSel[0]!} patch={(fn) => patchEls([tablesSel[0]!.id], (e) => (e.kind === 'table' ? fn(e) : e))} />}
              </div>
            </div>
          )}
          {tab === 'insert' && (
            <div className="flex w-max flex-nowrap items-center gap-0.5 pt-3">
              {LayoutMenu}
              <Tb icon={Copy} label={s('duplicateSlide')} onClick={duplicateSlide}>{s('duplicateSlide')}</Tb>
              <Sep />
              <Tb icon={Type} label={s('textBox')} active={tool?.type === 'text'} onClick={() => setTool(tool?.type === 'text' ? null : { type: 'text' })}>{s('textBox')}</Tb>
              {shapePicker}
              <Tb icon={Slash} label={s('line')} active={tool?.type === 'shape' && tool.geom === 'line'} onClick={() => setTool({ type: 'shape', geom: 'line' })}>{s('line')}</Tb>
              <Tb icon={ArrowRight} label={s('arrow')} onClick={() => {
                const th = themeForBg(slide.bg)
                addElements([newShape({ x: doc.w * 0.3, y: doc.h * 0.5, w: doc.w * 0.4, h: 0, geom: 'line', line: th.text, lineW: 3, arrowEnd: true })])
              }}>{s('arrow')}</Tb>
              <Sep />
              <Tb icon={ImagePlus} label={s('image')} onClick={() => imgInput.current?.click()}>{s('image')}</Tb>
              {tablePicker}
              {tool && <span className="ml-2 text-xs text-[var(--color-text-muted)]">{s('drawHint')}</span>}
            </div>
          )}
          {tab === 'design' && (
            <div className="flex w-max flex-nowrap items-center gap-1 pt-3">
              {THEMES.map((th) => (
                <button key={th.id} type="button" title={s(`theme.${th.id}`)} onClick={() => applyTheme(th, false)}
                  className="relative h-12 w-[72px] shrink-0 overflow-hidden rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent)]"
                  style={{ background: th.bg }}>
                  <span className="absolute left-2 top-2 text-sm font-bold" style={{ color: th.text }}>Aa</span>
                  <span className="absolute bottom-0 left-0 h-1.5 w-full" style={{ background: th.accent }} />
                </button>
              ))}
              <Button variant="ghost" size="xs" onClick={() => applyTheme(themeForBg(slide.bg), true)} className="mx-1"><Palette className="size-3.5" />{s('applyAll')}</Button>
              <Sep />
              <ColorMenu icon={PaintBucket} label={s('background')} value={slide.bg} onPick={(c) => patchSlide((sl) => ({ ...sl, bg: c ?? '#ffffff', bgImage: undefined }))} />
              <Tb icon={ImagePlus} label={s('bgImage')} onClick={() => bgInput.current?.click()}>{s('bgImage')}</Tb>
              {slide.bgImage && <Tb icon={X} label={s('bgImageRemove')} onClick={() => patchSlide((sl) => ({ ...sl, bgImage: undefined }))} />}
              <Sep />
              <Menu label={s('slideSize')} width={200} trigger={<span className="flex items-center gap-1.5"><Maximize size={16} />{s('slideSize')}</span>}>
                {(close) => (
                  <div>
                    {[['16:9', 1280, 720], ['16:10', 1280, 800], ['4:3', 960, 720], ['A4', 1123, 794]].map(([l, w, h]) => (
                      <MenuItem key={l as string} active={doc.w === w && doc.h === h} onClick={() => { resizeDeck(w as number, h as number); close() }}>{l}</MenuItem>
                    ))}
                  </div>
                )}
              </Menu>
            </div>
          )}
          {tab === 'view' && (
            <div className="flex w-max flex-nowrap items-center gap-0.5 pt-3">
              <Tb icon={ZoomOut} label={s('zoomOut')} onClick={() => { setFit(false); setZoom(clamp(Math.round(scale * 100 - 10), 10, 400)) }} />
              <span className="w-12 text-center text-xs text-[var(--color-text-secondary)]">{Math.round(scale * 100)}%</span>
              <Tb icon={ZoomIn} label={s('zoomIn')} onClick={() => { setFit(false); setZoom(clamp(Math.round(scale * 100 + 10), 10, 400)) }} />
              <Tb icon={Maximize} label={s('zoomFit')} active={fit} onClick={() => setFit(true)}>{s('zoomFit')}</Tb>
              <Sep />
              <Tb icon={Layers} label={s('snap')} active={snap} onClick={() => setSnap(!snap)}>{s('snap')}</Tb>
              <Sep />
              <Tb icon={Play} label={s('presentFirst')} onClick={() => { stopEditing(); setPresenting(0) }}>{s('presentFirst')}</Tb>
              <Tb icon={Play} label={s('presentCurrent')} onClick={() => { stopEditing(); setPresenting(slideIdx) }}>{s('presentCurrent')}</Tb>
            </div>
          )}
        </div>
      </div>

      {/* workspace */}
      <div className="flex min-h-0 flex-1">
        {/* thumbnails */}
        <aside className="flex w-48 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-[var(--color-border)] px-2">
            <Tb icon={Plus} label={s('newSlide')} onClick={() => addSlide('titleContent')} />
            <Tb icon={Copy} label={s('duplicateSlide')} onClick={duplicateSlide} />
            <Tb icon={Trash2} label={s('deleteSlide')} onClick={deleteSlide} />
            <Tb icon={ChevronUp} label={s('moveUp')} disabled={slideIdx === 0} onClick={() => moveSlide(slideIdx, slideIdx - 1)} />
            <Tb icon={ChevronDown} label={s('moveDown')} disabled={slideIdx === doc.slides.length - 1} onClick={() => moveSlide(slideIdx, slideIdx + 1)} />
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {doc.slides.map((sl, i) => {
              const tw = 160
              return (
                <div
                  key={sl.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/slide', String(i))}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('text/slide')) { e.preventDefault(); setDragOverThumb(i) } }}
                  onDragLeave={() => setDragOverThumb(null)}
                  onDrop={(e) => { e.preventDefault(); setDragOverThumb(null); const from = Number(e.dataTransfer.getData('text/slide')); if (!Number.isNaN(from)) moveSlide(from, i) }}
                  onClick={() => { stopEditing(); setSlideIdx(i); setSel([]) }}
                  className={cn('flex cursor-pointer gap-1.5 rounded-md p-1', i === slideIdx ? 'bg-[var(--color-accent)]/10' : 'hover:bg-[var(--color-surface-raised)]', dragOverThumb === i && 'ring-2 ring-[var(--color-accent)]')}
                >
                  <span className="w-4 shrink-0 pt-1 text-right text-[10px] text-[var(--color-text-muted)]">{i + 1}</span>
                  <div className={cn('overflow-hidden rounded border', i === slideIdx ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]')} style={{ width: tw, height: (tw * doc.h) / doc.w }}>
                    <div style={{ width: doc.w, height: doc.h, transform: `scale(${tw / doc.w})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                      <SlideView slide={sl} w={doc.w} h={doc.h} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* canvas */}
        <div ref={areaRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto">
          <div className="flex min-h-full min-w-full items-center justify-center p-6" style={{ width: Math.max(stageW + 48, avail.w), height: Math.max(stageH + 48, avail.h) }}>
            <div style={{ width: stageW, height: stageH, flexShrink: 0 }} className="shadow-xl">
              <div
                ref={stageRef}
                onPointerDown={onStageDown}
                onDoubleClick={(e) => {
                  const id = (e.target as HTMLElement).closest('[data-el]')?.getAttribute('data-el')
                  const el = slide.elements.find((x) => x.id === id)
                  if (el && !el.locked && (el.kind === 'table' || (el.kind === 'shape' && el.geom !== 'line'))) startEditing(el.id)
                }}
                style={{ width: doc.w, height: doc.h, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative', cursor: tool ? 'crosshair' : undefined, touchAction: 'none' }}
              >
                <SlideView slide={slide} w={doc.w} h={doc.h} hooks={hooks} interactive />
                {/* selection overlay */}
                <div className="pointer-events-none absolute inset-0">
                  {selEls.map((el) => (
                    <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: Math.max(el.h, el.kind === 'table' ? 0 : 1), transform: el.rot ? `rotate(${el.rot}deg)` : undefined, outline: `${1.5 / scale}px ${editingId === el.id ? 'dashed' : 'solid'} var(--color-accent)`, outlineOffset: 0 }}>
                      {single && el.id === single.id && !editingId && (
                        <>
                          {(Object.keys(HANDLES) as Handle[]).filter((h) => !(el.kind === 'shape' && el.geom === 'line' && (h === 'n' || h === 's'))).map((h) => {
                            const [hx, hy] = HANDLES[h]
                            return <div key={h} data-handle={h} style={{ position: 'absolute', left: `${(hx + 1) * 50}%`, top: `${(hy + 1) * 50}%`, width: hs, height: hs, marginLeft: -hs / 2, marginTop: -hs / 2, background: '#fff', border: `${1.5 / scale}px solid var(--color-accent)`, borderRadius: 2 / scale, cursor: HANDLE_CURSOR[h], pointerEvents: 'auto' }} />
                          })}
                          <div style={{ position: 'absolute', left: '50%', top: -28 / scale, width: 1.5 / scale, height: 28 / scale, background: 'var(--color-accent)', marginLeft: -0.75 / scale }} />
                          <div data-handle="rot" style={{ position: 'absolute', left: '50%', top: -28 / scale - hs / 2, width: hs, height: hs, marginLeft: -hs / 2, background: 'var(--color-accent)', borderRadius: '50%', cursor: 'grab', pointerEvents: 'auto' }} />
                        </>
                      )}
                    </div>
                  ))}
                  {box && <div style={{ position: 'absolute', left: box.x0, top: box.y0, width: box.w, height: box.h, outline: `${1 / scale}px dashed var(--color-accent)` }} />}
                  {guides.x.map((x) => <div key={`gx${x}`} style={{ position: 'absolute', left: x, top: 0, width: 1 / scale, height: doc.h, background: '#ec4899' }} />)}
                  {guides.y.map((y) => <div key={`gy${y}`} style={{ position: 'absolute', top: y, left: 0, height: 1 / scale, width: doc.w, background: '#ec4899' }} />)}
                  {marquee && <div style={{ position: 'absolute', left: marquee.x0, top: marquee.y0, width: marquee.x1 - marquee.x0, height: marquee.y1 - marquee.y0, background: 'rgba(79,70,229,.12)', outline: `${1 / scale}px solid var(--color-accent)` }} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text-muted)]">
        <span>{s('slideOf', { n: slideIdx + 1, total: doc.slides.length })}</span>
        <span>{canEditText && !editing ? s('hintEdit') : ''}</span>
        <span>{Math.round(scale * 100)}%</span>
      </div>

      {presenting !== null && <Presenter deck={doc} start={presenting} onClose={() => setPresenting(null)} />}
    </div>
  )
}

// ── small components ──────────────────────────────────────────────────────────

function GeomPreview({ geom }: { geom: GeomKind }) {
  const common = { fill: 'currentColor', fillOpacity: 0.25, stroke: 'currentColor', strokeWidth: 1.3 }
  if (geom === 'rect') return <rect x="3" y="5" width="16" height="12" {...common} />
  if (geom === 'roundRect') return <rect x="3" y="5" width="16" height="12" rx="3.5" {...common} />
  if (geom === 'ellipse') return <ellipse cx="11" cy="11" rx="8" ry="6.5" {...common} />
  if (geom === 'line') return <line x1="3" y1="18" x2="19" y2="4" stroke="currentColor" strokeWidth="1.6" />
  const d = geomPath(geom, 18, 18)
  return <path d={d ?? ''} transform="translate(2 2)" {...common} />
}

function TableGrid({ onPick, label }: { onPick: (r: number, c: number) => void; label: string }) {
  const [h, setH] = useState<[number, number]>([0, 0])
  return (
    <div>
      <MenuTitle>{label}{h[0] ? ` — ${h[0]} × ${h[1]}` : ''}</MenuTitle>
      <div className="grid grid-cols-6 gap-1 p-1" onMouseLeave={() => setH([0, 0])}>
        {Array.from({ length: 36 }, (_, i) => {
          const r = Math.floor(i / 6) + 1, c = (i % 6) + 1
          return <button key={i} type="button" onMouseEnter={() => setH([r, c])} onClick={() => onPick(r, c)} aria-label={`${r} × ${c}`}
            className={cn('size-6 rounded-sm border', r <= h[0] && c <= h[1] ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/25' : 'border-[var(--color-border)]')} />
        })}
      </div>
    </div>
  )
}

function OpacityMenu({ s, el, onPick }: { s: (k: string) => string; el: SlideEl | null; onPick: (a: number) => void }) {
  const val = el?.kind === 'image' ? el.alpha ?? 1 : el?.kind === 'shape' ? el.fillAlpha ?? 1 : 1
  return (
    <Menu label={s('opacity')} width={190} disabled={!el || el.kind === 'table'} trigger={<span className="text-[11px] font-medium">{Math.round(val * 100)}%</span>}>
      {() => (
        <label className="flex items-center gap-2 px-2 py-1 text-xs text-[var(--color-text-secondary)]">
          {s('opacity')}
          <input type="range" min={5} max={100} value={Math.round(val * 100)} onChange={(e) => onPick(Number(e.target.value) / 100)} className="flex-1" />
        </label>
      )}
    </Menu>
  )
}

function ArrangeMenu({ s, disabled, multi, order, align, distribute, rotate, flipH, flipV }: {
  s: (k: string) => string; disabled: boolean; multi: boolean
  order: (m: 'front' | 'back' | 'forward' | 'backward') => void; align: (m: 'l' | 'c' | 'r' | 't' | 'm' | 'b') => void
  distribute: (a: 'h' | 'v') => void; rotate: () => void; flipH: () => void; flipV: () => void
}) {
  const item = (icon: LucideIcon, label: string, fn: () => void, close: () => void, off = false) => (
    <MenuItem icon={icon} disabled={off} onClick={() => { fn(); close() }}>{label}</MenuItem>
  )
  return (
    <Menu label={s('arrange')} width={230} disabled={disabled} trigger={<span className="flex items-center gap-1.5"><BringToFront size={16} />{s('arrange')}</span>}>
      {(close) => (
        <div>
          <MenuTitle>{s('order')}</MenuTitle>
          {item(BringToFront, s('front'), () => order('front'), close)}
          {item(SendToBack, s('back'), () => order('back'), close)}
          {item(ArrowUp, s('forward'), () => order('forward'), close)}
          {item(ArrowDown, s('backward'), () => order('backward'), close)}
          <MenuTitle>{multi ? s('alignSelection') : s('alignSlide')}</MenuTitle>
          {item(AlignHorizontalJustifyStart, s('alignL'), () => align('l'), close)}
          {item(AlignHorizontalJustifyCenter, s('alignC'), () => align('c'), close)}
          {item(AlignHorizontalJustifyEnd, s('alignR'), () => align('r'), close)}
          {item(AlignVerticalJustifyStart, s('alignT'), () => align('t'), close)}
          {item(AlignVerticalJustifyCenter, s('alignM'), () => align('m'), close)}
          {item(AlignVerticalJustifyEnd, s('alignB'), () => align('b'), close)}
          {item(AlignHorizontalDistributeCenter, s('distH'), () => distribute('h'), close, !multi)}
          {item(AlignVerticalDistributeCenter, s('distV'), () => distribute('v'), close, !multi)}
          <MenuTitle>{s('rotate')}</MenuTitle>
          {item(RotateCw, s('rotate90'), rotate, close)}
          {item(FlipHorizontal2, s('flipH'), flipH, close)}
          {item(FlipVertical2, s('flipV'), flipV, close)}
        </div>
      )}
    </Menu>
  )
}

function TableTools({ s, el, patch }: { s: (k: string) => string; el: TableEl; patch: (fn: (e: TableEl) => TableEl) => void }) {
  const cols = el.colW.length
  return (
    <>
      <Sep />
      <Tb icon={Plus} label={s('addRow')} onClick={() => patch((e) => ({ ...e, h: e.h + e.rowH, rows: [...e.rows, Array.from({ length: cols }, () => ({ text: '' }))] }))}>{s('addRow')}</Tb>
      <Tb icon={Plus} label={s('addCol')} onClick={() => patch((e) => ({ ...e, w: e.w + 150, colW: [...e.colW, 150], rows: e.rows.map((r) => [...r, { text: '', fill: e.header && r === e.rows[0] ? r[0]?.fill : undefined, color: r[0]?.color, bold: r[0]?.bold }]) }))}>{s('addCol')}</Tb>
      <Tb icon={Minus} label={s('delRow')} disabled={el.rows.length < 2} onClick={() => patch((e) => ({ ...e, h: e.h - e.rowH, rows: e.rows.slice(0, -1) }))}>{s('delRow')}</Tb>
      <Tb icon={Minus} label={s('delCol')} disabled={cols < 2} onClick={() => patch((e) => ({ ...e, w: e.w - (e.colW[e.colW.length - 1] ?? 0), colW: e.colW.slice(0, -1), rows: e.rows.map((r) => r.slice(0, -1)) }))}>{s('delCol')}</Tb>
    </>
  )
}

function Presenter({ deck, start, onClose }: { deck: Doc; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void root.current?.requestFullscreen?.().catch(() => undefined)
    const onFs = () => { if (!document.fullscreenElement) onClose() }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); setI((x) => Math.min(x + 1, deck.slides.length - 1)) }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); setI((x) => Math.max(x - 1, 0)) }
      else if (e.key === 'Home') setI(0)
      else if (e.key === 'End') setI(deck.slides.length - 1)
    }
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onResize)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const k = Math.min(size.w / deck.w, size.h / deck.h)
  return (
    <div ref={root} className="fixed inset-0 z-[100] flex items-center justify-center bg-black" onClick={() => setI((x) => Math.min(x + 1, deck.slides.length - 1))}>
      <div style={{ width: deck.w * k, height: deck.h * k }}>
        <div style={{ width: deck.w, height: deck.h, transform: `scale(${k})`, transformOrigin: 'top left' }}>
          <SlideView slide={deck.slides[i]!} w={deck.w} h={deck.h} />
        </div>
      </div>
      <button type="button" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose() }} className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/20"><X size={18} /></button>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/50">{i + 1} / {deck.slides.length}</div>
    </div>
  )
}

void ElementView
void PX_PER_PT
