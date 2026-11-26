import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { PDFDocument } from 'pdf-lib'
import { TextLayer } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  AlignJustify,
  Bold,
  BoxSelect,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Eraser,
  FilePlus2,
  FileText,
  FolderOpen,
  Highlighter,
  ImagePlus,
  Italic,
  Maximize2,
  MousePointer2,
  PanelLeft,
  PenTool,
  Redo2,
  RotateCcw,
  Signature,
  TextCursorInput,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AnnotationLayer } from './AnnotationLayer'
import { exportAnnotatedPdf } from './exportPdf'
import { PageThumbnails } from './PageThumbnails'
import { ShapeIcon } from './ShapeIcon'
import type { PolygonKind } from './shapeGeometry'
import { baselineFromTop, fitLetterSpacing, lineHeightFactor, measureTextWidth } from './fontInfo'
import { extractPageShapes } from './pdfShapes'
import { applySuppressions, type Suppression } from './pdfSuppress'
import type { TextSuppression } from './pdfTextRemover'
import { SignatureModal } from './SignatureModal'
import {
  COLOR_SWATCHES,
  HIGHLIGHT_SWATCHES,
  type Annotation,
  type DetectedTextItem,
  type EditorTool,
  type FontFamily,
  type ImageAnnotation,
  type PageEntry,
  type PdfShape,
  type ShapeSuppression,
  type TextAnnotation,
  type ToolStyleConfig,
} from './types'

type PDFDocumentProxy = import('pdfjs-dist').PDFDocumentProxy
type PDFPageProxy = import('pdfjs-dist').PDFPageProxy

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  return pdfjs
}

function formatFileName(name: string, maxLen = 32) {
  if (name.length <= maxLen) return name
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot) : ''
  return name.slice(0, maxLen - ext.length - 3) + '…' + ext
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Keeps an exact value (e.g. 10.91px read from the PDF) selectable in a preset list. */
function withCurrent(options: number[], current: number): number[] {
  if (options.some((o) => Math.abs(o - current) < 0.005)) return options
  return [...options, current].sort((a, b) => a - b)
}

const EMPTY_SHAPES: PdfShape[] = []

function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100)
}

interface PdfState {
  doc: PDFDocumentProxy
  originalBytes: Uint8Array
  workingBytes: Uint8Array
  name: string
}

interface HistorySnapshot {
  annotations: Annotation[]
  suppressions: Suppression[]
  /** Page order / rotation at that moment (page operations are undoable too) */
  pages?: PageEntry[]
}

type ZoomMode = 'custom' | 'fit-width' | 'fit-page'

function DropZone({ onFile, onNewBlank }: { onFile: (file: File) => void; onNewBlank: () => void }) {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        onFile(file)
      }
    },
    [onFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFile(file)
      e.target.value = ''
    },
    [onFile],
  )

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        aria-label={t('tools.pdfEditor.dropzone')}
        className={cn(
          'group relative flex w-full max-w-md cursor-pointer select-none flex-col items-center gap-5 rounded-2xl border border-dashed p-14 transition-colors',
          dragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]',
        )}
      >
        <div
          className={cn(
            'flex size-14 items-center justify-center rounded-xl transition-colors',
            dragging
              ? 'bg-[var(--color-accent)] text-white'
              : 'bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)] group-hover:bg-[var(--color-accent)] group-hover:text-white',
          )}
        >
          <FileText className="size-6" aria-hidden />
        </div>

        <div className="text-center">
          <p className="text-base font-medium text-[var(--color-text-primary)]">
            {t('tools.pdfEditor.dropzone')}
          </p>
          <p className="mt-1.5 text-sm text-[var(--color-text-tertiary)]">
            {t('tools.pdfEditor.dropzoneOr')}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-[var(--color-accent-hover)]">
            <Upload className="size-4" />
            {t('tools.pdfEditor.browse')}
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-disabled)]">PDF</p>
      </div>

      <Button variant="secondary" size="sm" onClick={onNewBlank} className="gap-2">
        <FilePlus2 className="size-4" />
        {t('tools.pdfEditor.newBlank')}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={handleChange}
        tabIndex={-1}
      />
    </div>
  )
}

function PdfPageCanvas({
  canvasRef,
  page,
  userRotation,
  blankSize,
  scale,
  onRendered,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  page: PDFPageProxy | null
  userRotation: 0 | 90 | 180 | 270
  blankSize: { width: number; height: number }
  scale: number
  onRendered?: () => void
}) {
  const renderTask = useRef<{ cancel: () => void } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    renderTask.current?.cancel()

    const dpr = window.devicePixelRatio || 1

    if (!page) {
      const swapped = userRotation === 90 || userRotation === 270
      const w = (swapped ? blankSize.height : blankSize.width) * scale
      const h = (swapped ? blankSize.width : blankSize.height) * scale
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${Math.round(w)}px`
      canvas.style.height = `${Math.round(h)}px`
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      onRendered?.()
      return
    }

    const totalRot = (((page.rotate + userRotation) % 360 + 360) % 360) as 0 | 90 | 180 | 270
    const viewport = page.getViewport({ scale, rotation: totalRot })
    const ctx = canvas.getContext('2d')!

    canvas.width = Math.round(viewport.width * dpr)
    canvas.height = Math.round(viewport.height * dpr)
    canvas.style.width = `${Math.round(viewport.width)}px`
    canvas.style.height = `${Math.round(viewport.height)}px`

    ctx.scale(dpr, dpr)

    const task = page.render({ canvasContext: ctx, viewport, canvas })
    renderTask.current = task

    task.promise.then(() => onRendered?.()).catch(() => { /* cancelled */ })

    return () => {
      task.cancel()
    }
  }, [canvasRef, page, userRotation, blankSize.width, blankSize.height, scale, onRendered])

  return <canvas ref={canvasRef} className="block rounded-sm bg-white shadow-xl" />
}

function PdfTextLayer({
  page,
  userRotation,
  scale,
  interactive,
}: {
  page: PDFPageProxy | null
  userRotation: 0 | 90 | 180 | 270
  scale: number
  interactive: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''
    if (!page) return

    const totalRot = (((page.rotate + userRotation) % 360 + 360) % 360) as 0 | 90 | 180 | 270
    const viewport = page.getViewport({ scale, rotation: totalRot })
    container.style.setProperty('--total-scale-factor', String(scale))

    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport,
    })

    textLayer.render().catch(() => {
      // Cancelled
    })

    return () => {
      textLayer.cancel()
      container.innerHTML = ''
    }
  }, [page, userRotation, scale])

  return (
    <div
      ref={containerRef}
      className={cn('textLayer z-10', interactive ? 'pointer-events-auto' : 'pointer-events-none')}
    />
  )
}

function ToolbarSeparator() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-[var(--color-border)]" aria-hidden />
}

export default function PdfEditorPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [pdf, setPdf] = useState<PdfState | null>(null)
  const [pages, setPages] = useState<PageEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pageProxy, setPageProxy] = useState<PDFPageProxy | null>(null)
  const [vpSize, setVpSize] = useState<{ width: number; height: number }>({ width: 595, height: 842 })

  const [scale, setScale] = useState(1.2)
  const [shapesOpen, setShapesOpen] = useState(false)
  const [lastShape, setLastShape] = useState<string>('rect')
  const [zoomMode, setZoomMode] = useState<ZoomMode>('custom')
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageInput, setPageInput] = useState('1')
  const [showSidebar, setShowSidebar] = useState(true)

  // Editing state
  const [tool, setTool] = useState<EditorTool>('select')
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [suppressions, setSuppressions] = useState<Suppression[]>([])
  const [history, setHistory] = useState<HistorySnapshot[]>([{ annotations: [], suppressions: [] }])
  const [historyIdx, setHistoryIdx] = useState(0)
  const pagesRef = useRef<PageEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [shapeState, setShapeState] = useState<{
    bytes: Uint8Array | null
    index: number | null
    shapes: PdfShape[]
  }>({ bytes: null, index: null, shapes: [] })
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)

  const [styleConfig, setStyleConfig] = useState<ToolStyleConfig>({
    color: '#0f172a',
    fillColor: null,
    textBgColor: null,
    fontSize: 16,
    fontFamily: 'Helvetica',
    bold: false,
    italic: false,
    strokeWidth: 2,
    highlightColor: '#fef08a',
    polygonKind: 'triangle',
    redactColor: '#ffffff',
  })

  const viewportRef = useRef<HTMLDivElement>(null)
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const openFileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const annotationsRef = useRef<Annotation[]>(annotations)
  const suppressionsRef = useRef<Suppression[]>(suppressions)
  const pdfRef = useRef<PdfState | null>(pdf)
  const syncSeqRef = useRef(0)
  const pristinePdfTextRef = useRef<TextAnnotation | null>(null)

  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  useEffect(() => {
    suppressionsRef.current = suppressions
  }, [suppressions])

  useEffect(() => {
    pdfRef.current = pdf
  }, [pdf])

  const currentEntry = pages[currentIndex] ?? null

  const syncWorkingPdf = useCallback(
    async (
      nextSuppressions: Suppression[],
      pendingTransparent?: { annId: string; suppressionId: string },
    ) => {
      const currentPdf = pdfRef.current
      if (!currentPdf) return
      const seq = ++syncSeqRef.current
      try {
        const { bytes, matchedIds } = await applySuppressions(
          currentPdf.originalBytes,
          nextSuppressions,
        )
        if (seq !== syncSeqRef.current) return

        const pdfjs = await loadPdfJs()
        const nextDoc = await pdfjs.getDocument({ data: bytes.slice(), fontExtraProperties: true })
          .promise
        if (seq !== syncSeqRef.current) return

        setPdf((prev) => (prev ? { ...prev, doc: nextDoc, workingBytes: bytes } : prev))

        if (pendingTransparent && matchedIds.has(pendingTransparent.suppressionId)) {
          const cleared = annotationsRef.current.map((a) =>
            a.id === pendingTransparent.annId && a.type === 'text'
              ? { ...a, backgroundColor: null }
              : a,
          )
          annotationsRef.current = cleared
          setAnnotations(cleared)
          setHistory((prev) =>
            prev.map((snap) => ({
              ...snap,
              annotations: snap.annotations.map((a) =>
                a.id === pendingTransparent.annId && a.type === 'text'
                  ? { ...a, backgroundColor: null }
                  : a,
              ),
            })),
          )
        }
      } catch (err) {
        console.error('Failed to update PDF text stream:', err)
      }
    },
    [],
  )

  // ── History helpers ────────────────────────────────────────────────────────
  const pushHistory = useCallback(
    (
      nextAnns: Annotation[],
      nextSuppressions: Suppression[] = suppressionsRef.current,
      nextPages: PageEntry[] = pagesRef.current,
    ) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIdx + 1)
        const updated = [
          ...sliced,
          { annotations: nextAnns, suppressions: nextSuppressions, pages: nextPages },
        ].slice(-50)
        setHistoryIdx(updated.length - 1)
        return updated
      })
    },
    [historyIdx],
  )

  const undo = useCallback(() => {
    if (historyIdx <= 0) return
    const nextIdx = historyIdx - 1
    const snap = history[nextIdx]
    if (!snap) return
    const prevSupCount = suppressionsRef.current.length
    setHistoryIdx(nextIdx)
    setAnnotations(snap.annotations)
    setSuppressions(snap.suppressions)
    if (snap.pages) {
      setPages(snap.pages)
      pagesRef.current = snap.pages
      setCurrentIndex((i) => Math.min(i, snap.pages!.length - 1))
    }
    annotationsRef.current = snap.annotations
    suppressionsRef.current = snap.suppressions
    setSelectedId(null)
    setSelectedShapeId(null)
    setEditingTextId(null)
    if (snap.suppressions.length !== prevSupCount) {
      void syncWorkingPdf(snap.suppressions)
    }
  }, [history, historyIdx, syncWorkingPdf])

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return
    const nextIdx = historyIdx + 1
    const snap = history[nextIdx]
    if (!snap) return
    const prevSupCount = suppressionsRef.current.length
    setHistoryIdx(nextIdx)
    setAnnotations(snap.annotations)
    setSuppressions(snap.suppressions)
    if (snap.pages) {
      setPages(snap.pages)
      pagesRef.current = snap.pages
      setCurrentIndex((i) => Math.min(i, snap.pages!.length - 1))
    }
    annotationsRef.current = snap.annotations
    suppressionsRef.current = snap.suppressions
    setSelectedId(null)
    setSelectedShapeId(null)
    setEditingTextId(null)
    if (snap.suppressions.length !== prevSupCount) {
      void syncWorkingPdf(snap.suppressions)
    }
  }, [history, historyIdx, syncWorkingPdf])

  const addAnnotation = useCallback(
    (ann: Annotation, recordHistory = true) => {
      const next = [...annotationsRef.current, ann]
      annotationsRef.current = next
      setAnnotations(next)
      if (recordHistory) pushHistory(next)
    },
    [pushHistory],
  )

  const handleReplacePdfText = useCallback(
    (
      item: DetectedTextItem,
      sampled: { color: string; backgroundColor: string; bold: boolean },
    ) => {
      if (!currentEntry) return
      const suppressionId = uid()
      let nextSuppressions = suppressionsRef.current
      if (currentEntry.originalIndex !== null) {
        const sup: TextSuppression = {
          kind: 'text',
          id: suppressionId,
          originalPageIndex: currentEntry.originalIndex,
          pdfX: item.pdfX,
          pdfMaxX: item.pdfMaxX,
          pdfY: item.pdfY,
          pdfFontSize: item.pdfFontSize,
        }
        nextSuppressions = [...suppressionsRef.current, sup]
        suppressionsRef.current = nextSuppressions
        setSuppressions(nextSuppressions)
      }

      // Same font, exact size, same baseline and same line width as the original text,
      // so the replacement lands exactly where the original was.
      const letterSpacing = fitLetterSpacing(
        item.text,
        item.fontFamily,
        sampled.bold,
        item.italic,
        item.fontSize,
        item.width,
      )
      const textWidth = measureTextWidth(
        item.text,
        item.fontFamily,
        sampled.bold,
        item.italic,
        item.fontSize,
        letterSpacing,
      )
      const newText: TextAnnotation = {
        id: uid(),
        pageId: currentEntry.id,
        type: 'text',
        x: item.x,
        y: item.baselineY - baselineFromTop(item.fontFamily, item.fontSize, true),
        width: Math.max(item.width, textWidth) + 4,
        height: lineHeightFactor(true) * item.fontSize,
        text: item.text,
        fontSize: item.fontSize,
        fontFamily: item.fontFamily,
        bold: sampled.bold,
        italic: item.italic,
        color: sampled.color,
        backgroundColor: sampled.backgroundColor,
        compact: true,
        letterSpacing: letterSpacing || undefined,
        suppressionId,
      }
      const nextAnns = [...annotationsRef.current, newText]
      annotationsRef.current = nextAnns
      setAnnotations(nextAnns)
      pushHistory(nextAnns, nextSuppressions)
      pristinePdfTextRef.current = newText
      setSelectedId(newText.id)
      setEditingTextId(newText.id)

      if (currentEntry.originalIndex !== null) {
        void syncWorkingPdf(nextSuppressions, { annId: newText.id, suppressionId })
      }
    },
    [currentEntry, pushHistory, syncWorkingPdf],
  )

  /** Removes a shape that already exists in the PDF, optionally replacing it by an editable copy. */
  const handleReplacePdfShape = useCallback(
    (shape: PdfShape, replacement: Annotation | null) => {
      if (!currentEntry || currentEntry.originalIndex === null) return
      const sup: ShapeSuppression = {
        kind: 'shape',
        id: uid(),
        originalPageIndex: currentEntry.originalIndex,
        boxes: shape.members ?? [shape.box],
      }
      const nextSuppressions = [...suppressionsRef.current, sup]
      suppressionsRef.current = nextSuppressions
      setSuppressions(nextSuppressions)

      const nextAnns = replacement ? [...annotationsRef.current, replacement] : annotationsRef.current
      annotationsRef.current = nextAnns
      setAnnotations(nextAnns)
      pushHistory(nextAnns, nextSuppressions)

      setShapeState((prev) => ({ ...prev, shapes: prev.shapes.filter((s) => s.id !== shape.id) }))
      setSelectedShapeId(null)
      if (replacement) {
        setSelectedId(replacement.id)
        setTool('select')
      }
      void syncWorkingPdf(nextSuppressions)
    },
    [currentEntry, pushHistory, syncWorkingPdf],
  )

  const updateAnnotation = useCallback(
    (id: string, patch: Partial<Annotation>, recordHistory = false) => {
      const next = annotationsRef.current.map((a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a,
      )
      annotationsRef.current = next
      setAnnotations(next)
      if (recordHistory) pushHistory(next)
    },
    [pushHistory],
  )

  const commitHistory = useCallback(() => {
    const pristine = pristinePdfTextRef.current
    if (pristine) {
      pristinePdfTextRef.current = null
      const current = annotationsRef.current.find((a) => a.id === pristine.id)
      if (
        current &&
        current.type === 'text' &&
        current.text === pristine.text &&
        current.color === pristine.color &&
        current.fontFamily === pristine.fontFamily &&
        current.fontSize === pristine.fontSize &&
        current.bold === pristine.bold &&
        current.italic === pristine.italic
      ) {
        // Zero edits made: revert the replacement so the original PDF text keeps its exact font, size, and color
        const nextAnns = annotationsRef.current.filter((a) => a.id !== pristine.id)
        annotationsRef.current = nextAnns
        setAnnotations(nextAnns)
        setSelectedId((prev) => (prev === pristine.id ? null : prev))

        const hadSup =
          !!pristine.suppressionId &&
          suppressionsRef.current.some((s) => s.id === pristine.suppressionId)
        if (hadSup) {
          const nextSup = suppressionsRef.current.filter((s) => s.id !== pristine.suppressionId)
          suppressionsRef.current = nextSup
          setSuppressions(nextSup)
          void syncWorkingPdf(nextSup)
        }

        setHistory((prev) => {
          if (historyIdx > 0) {
            const trimmed = prev.slice(0, historyIdx)
            setHistoryIdx(trimmed.length - 1)
            return trimmed
          }
          return prev
        })
        return
      }
    }
    pushHistory(annotationsRef.current)
  }, [historyIdx, pushHistory, syncWorkingPdf])

  const deleteAnnotation = useCallback(
    (id: string) => {
      const next = annotationsRef.current.filter((a) => a.id !== id)
      annotationsRef.current = next
      setAnnotations(next)
      pushHistory(next)
      if (selectedId === id) setSelectedId(null)
      if (editingTextId === id) setEditingTextId(null)
    },
    [pushHistory, selectedId, editingTextId],
  )

  const duplicateAnnotation = useCallback(
    (id: string) => {
      const src = annotationsRef.current.find((a) => a.id === id)
      if (!src) return
      const offset = 16
      let copy: Annotation
      switch (src.type) {
        case 'draw':
        case 'highlight':
          copy = {
            ...src,
            id: uid(),
            points: src.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
          }
          break
        case 'line':
        case 'arrow':
          copy = {
            ...src,
            id: uid(),
            x1: src.x1 + offset,
            y1: src.y1 + offset,
            x2: src.x2 + offset,
            y2: src.y2 + offset,
          }
          break
        case 'text':
        case 'rect':
        case 'ellipse':
        case 'polygon':
        case 'redact':
        case 'image':
        case 'sign':
          copy = { ...src, id: uid(), x: src.x + offset, y: src.y + offset }
          break
      }
      const next = [...annotationsRef.current, copy]
      annotationsRef.current = next
      setAnnotations(next)
      pushHistory(next)
      setSelectedId(copy.id)
    },
    [pushHistory],
  )

  // ── Load file ──────────────────────────────────────────────────────────────
  const loadFile = useCallback(
    async (file: File) => {
      setLoading(true)
      setError(null)
      setPageProxy(null)
      setPdf(null)
      setPages([])
      setAnnotations([])
      setSuppressions([])
      suppressionsRef.current = []
      setHistory([{ annotations: [], suppressions: [] }])
      setHistoryIdx(0)
      setSelectedId(null)
      setEditingTextId(null)
      setCurrentIndex(0)
      setPageInput('1')
      setTool('select')

      try {
        const pdfjs = await loadPdfJs()
        const rawBytes = new Uint8Array(await file.arrayBuffer())
        // Pass a copy so pdfjs worker doesn't detach rawBytes
        const doc = await pdfjs.getDocument({ data: rawBytes.slice(), fontExtraProperties: true })
          .promise
        const entries: PageEntry[] = []
        for (let i = 0; i < doc.numPages; i++) {
          const p = await doc.getPage(i + 1)
          const vp = p.getViewport({ scale: 1 })
          entries.push({
            id: `pg-${i}-${uid()}`,
            originalIndex: i,
            userRotation: 0,
            baseWidth: vp.width,
            baseHeight: vp.height,
          })
        }
        setPdf({
          doc,
          originalBytes: rawBytes,
          workingBytes: rawBytes,
          name: file.name,
        })
        setPages(entries)
        pagesRef.current = entries
        setHistory([{ annotations: [], suppressions: [], pages: entries }])
        setHistoryIdx(0)
      } catch {
        setError(t('tools.pdfEditor.loadError'))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  const createBlankPdf = useCallback(async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595.28, 841.89]) // A4
    const bytes = await doc.save()
    const file = new File([bytes.slice()], `${t('tools.pdfEditor.untitledFile')}.pdf`, {
      type: 'application/pdf',
    })
    await loadFile(file)
  }, [loadFile, t])

  // ── Load file passed via router state or custom event ─────────────────────
  useEffect(() => {
    const state = location.state as { file?: File; newBlank?: boolean } | null
    if (state?.file) {
      const f = state.file
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => {
        void loadFile(f)
      })
    } else if (state?.newBlank) {
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => {
        void createBlankPdf()
      })
    }
  }, [location.state, location.pathname, navigate, loadFile, createBlankPdf])

  useEffect(() => {
    const handler = (e: Event) => {
      const file = (e as CustomEvent<{ file: File }>).detail?.file
      if (file) void loadFile(file)
    }
    window.addEventListener('edavio:open-file', handler)
    return () => window.removeEventListener('edavio:open-file', handler)
  }, [loadFile])

  // ── Load active page proxy & dimensions ────────────────────────────────────
  useEffect(() => {
    if (!pdf || !currentEntry) return
    let cancelled = false

    if (currentEntry.originalIndex === null) {
      const swapped = currentEntry.userRotation === 90 || currentEntry.userRotation === 270
      queueMicrotask(() => {
        if (cancelled) return
        setPageProxy(null)
        setVpSize({
          width: swapped ? currentEntry.baseHeight : currentEntry.baseWidth,
          height: swapped ? currentEntry.baseWidth : currentEntry.baseHeight,
        })
        setPageLoading(false)
      })
      return () => {
        cancelled = true
      }
    }

    pdf.doc.getPage(currentEntry.originalIndex + 1).then((p) => {
      if (cancelled) return
      const rot = (((p.rotate + currentEntry.userRotation) % 360 + 360) % 360) as
        | 0
        | 90
        | 180
        | 270
      const vp = p.getViewport({ scale: 1, rotation: rot })
      setVpSize({ width: vp.width, height: vp.height })
      setPageProxy(p)
      setPageLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [pdf, currentEntry])

  // ── Existing vector shapes of the current page ─────────────────────────────
  const workingBytes = pdf?.workingBytes ?? null
  const currentOriginalIndex = currentEntry?.originalIndex ?? null
  const wantShapes = tool === 'select' || tool === 'edit-shape'
  useEffect(() => {
    if (!workingBytes || currentOriginalIndex === null || !wantShapes) return
    let cancelled = false
    extractPageShapes(workingBytes, currentOriginalIndex)
      .then((shapes) => {
        if (!cancelled) {
          setShapeState({ bytes: workingBytes, index: currentOriginalIndex, shapes })
        }
      })
      .catch(() => {
        if (!cancelled) setShapeState({ bytes: workingBytes, index: currentOriginalIndex, shapes: [] })
      })
    return () => {
      cancelled = true
    }
  }, [workingBytes, currentOriginalIndex, wantShapes])

  // Only shapes extracted from the current bytes + page are shown (no stale shapes after a page change)
  const pageShapes =
    wantShapes && shapeState.bytes === workingBytes && shapeState.index === currentOriginalIndex
      ? shapeState.shapes
      : EMPTY_SHAPES

  // ── Zoom helpers ───────────────────────────────────────────────────────────
  const computeFitScale = useCallback(
    (mode: 'fit-width' | 'fit-page') => {
      if (!viewportRef.current) return scale
      const avail = viewportRef.current.getBoundingClientRect()
      if (mode === 'fit-width') {
        return Math.max(0.3, (avail.width - 56) / vpSize.width)
      }
      const ws = (avail.width - 56) / vpSize.width
      const hs = (avail.height - 56) / vpSize.height
      return Math.max(0.3, Math.min(ws, hs))
    },
    [vpSize.width, vpSize.height, scale],
  )

  const applyZoomMode = useCallback(
    (mode: ZoomMode) => {
      setZoomMode(mode)
      if (mode === 'fit-width' || mode === 'fit-page') {
        setScale(computeFitScale(mode))
      }
    },
    [computeFitScale],
  )

  const zoomBy = useCallback((delta: number) => {
    setZoomMode('custom')
    setScale((s) => Math.min(4, Math.max(0.3, parseFloat((s + delta).toFixed(2)))))
  }, [])

  // Ctrl + mouse wheel (or trackpad pinch) zooms the document instead of the whole window
  const hasPdf = !!pdf
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const step = Math.max(-0.5, Math.min(0.5, -e.deltaY * 0.0015))
      setZoomMode('custom')
      setScale((s) => Math.min(4, Math.max(0.3, parseFloat((s * (1 + step)).toFixed(2)))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hasPdf])

  // ── Page navigation ────────────────────────────────────────────────────────
  const goTo = useCallback(
    (n: number) => {
      if (pages.length === 0) return
      const clamped = Math.max(1, Math.min(pages.length, n))
      setCurrentIndex(clamped - 1)
      setPageInput(String(clamped))
      setSelectedId(null)
      setEditingTextId(null)
    },
    [pages.length],
  )

  // ── Page management ────────────────────────────────────────────────────────
  const commitPages = useCallback(
    (next: PageEntry[], nextAnns: Annotation[] = annotationsRef.current) => {
      pagesRef.current = next
      setPages(next)
      pushHistory(nextAnns, suppressionsRef.current, next)
    },
    [pushHistory],
  )

  const rotatePage = useCallback(
    (idx: number) => {
      commitPages(
        pagesRef.current.map((p, i) =>
          i === idx
            ? { ...p, userRotation: ((p.userRotation + 90) % 360) as 0 | 90 | 180 | 270 }
            : p,
        ),
      )
    },
    [commitPages],
  )

  const mirrorPage = useCallback(
    (idx: number) => {
      commitPages(
        pagesRef.current.map((p, i) => (i === idx ? { ...p, mirrored: !p.mirrored } : p)),
      )
    },
    [commitPages],
  )

  const duplicatePage = useCallback(
    (idx: number) => {
      const target = pages[idx]
      if (!target) return
      const newPageId = `pg-dup-${uid()}`
      const clone: PageEntry = { ...target, id: newPageId }
      const pageAnns = annotationsRef.current
        .filter((a) => a.pageId === target.id)
        .map((a) => ({ ...a, id: uid(), pageId: newPageId }))

      const nextPages = [...pagesRef.current]
      nextPages.splice(idx + 1, 0, clone)
      const nextAnns = [...annotationsRef.current, ...pageAnns]
      annotationsRef.current = nextAnns
      setAnnotations(nextAnns)
      commitPages(nextPages, nextAnns)
      setSelectedId(null)
      setEditingTextId(null)
      setCurrentIndex(idx + 1)
      setPageInput(String(idx + 2))
    },
    [pages, commitPages],
  )

  const addBlankPage = useCallback(() => {
    const refPage = pages[currentIndex]
    const newPage: PageEntry = {
      id: `pg-blank-${uid()}`,
      originalIndex: null,
      userRotation: 0,
      baseWidth: refPage?.baseWidth ?? 595,
      baseHeight: refPage?.baseHeight ?? 842,
    }
    const insertIdx = currentIndex + 1
    const nextPages = [...pagesRef.current]
    nextPages.splice(insertIdx, 0, newPage)
    commitPages(nextPages)
    setSelectedId(null)
    setEditingTextId(null)
    setCurrentIndex(insertIdx)
    setPageInput(String(insertIdx + 1))
  }, [pages, currentIndex, commitPages])

  const deletePage = useCallback(
    (idx: number) => {
      if (pages.length <= 1) return
      const removed = pages[idx]
      if (!removed) return
      const nextAnns = annotationsRef.current.filter((a) => a.pageId !== removed.id)
      annotationsRef.current = nextAnns
      setAnnotations(nextAnns)
      commitPages(
        pagesRef.current.filter((_, i) => i !== idx),
        nextAnns,
      )
      const nextIdx = Math.min(currentIndex, pages.length - 2)
      setSelectedId(null)
      setEditingTextId(null)
      setCurrentIndex(nextIdx)
      setPageInput(String(nextIdx + 1))
    },
    [pages, currentIndex, commitPages],
  )

  const movePage = useCallback(
    (idx: number, dir: -1 | 1) => {
      const target = idx + dir
      if (target < 0 || target >= pages.length) return
      const nextPages = [...pagesRef.current]
      const [item] = nextPages.splice(idx, 1)
      if (!item) return
      nextPages.splice(target, 0, item)
      commitPages(nextPages)
      if (currentIndex === idx) {
        setCurrentIndex(target)
        setPageInput(String(target + 1))
      } else if (currentIndex === target) {
        setCurrentIndex(idx)
        setPageInput(String(idx + 1))
      }
    },
    [pages.length, currentIndex, commitPages],
  )

  const reorderPage = useCallback(
    (from: number, to: number) => {
      const list = [...pagesRef.current]
      if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return
      const currentId = list[currentIndex]?.id
      const [item] = list.splice(from, 1)
      if (!item) return
      list.splice(to, 0, item)
      commitPages(list)
      // The page being looked at stays selected, wherever it ended up
      const nextIdx = Math.max(0, list.findIndex((p) => p.id === currentId))
      setCurrentIndex(nextIdx)
      setPageInput(String(nextIdx + 1))
    },
    [currentIndex, commitPages],
  )

  // ── Insert Image & Signature ───────────────────────────────────────────────
  const insertImageOnPage = useCallback(
    (dataUrl: string, aspectRatio: number, kind: 'image' | 'sign') => {
      if (!currentEntry) return
      const defaultWidth = kind === 'sign' ? Math.min(180, vpSize.width * 0.35) : Math.min(240, vpSize.width * 0.45)
      const defaultHeight = Math.max(24, defaultWidth / (aspectRatio || 1))
      const x = Math.max(20, (vpSize.width - defaultWidth) / 2)
      const y = Math.max(20, (vpSize.height - defaultHeight) / 2)

      const ann: ImageAnnotation = {
        id: uid(),
        pageId: currentEntry.id,
        type: kind,
        x,
        y,
        width: defaultWidth,
        height: defaultHeight,
        dataUrl,
        aspectRatio: aspectRatio || 1,
      }
      addAnnotation(ann, true)
      setSelectedId(ann.id)
      setTool('select')
    },
    [currentEntry, vpSize.width, vpSize.height, addAnnotation],
  )

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') return
      const img = new Image()
      img.onload = () => {
        const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5
        insertImageOnPage(dataUrl, ratio, 'image')
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!pdf || exporting) return
    setExporting(true)
    setError(null)
    try {
      const bytes = await exportAnnotatedPdf({
        rawBytes: pdf.workingBytes,
        pdfjsDoc: pdf.doc,
        pages,
        annotations,
      })
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const base = pdf.name.replace(/\.pdf$/i, '')
      a.href = url
      a.download = `${base}-edited.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportNotice(t('tools.pdfEditor.exportSuccess'))
      setTimeout(() => setExportNotice(null), 3500)
    } catch (err) {
      console.error(err)
      setError(t('tools.pdfEditor.exportError'))
    } finally {
      setExporting(false)
    }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const selectedShape = pageShapes.find((sh) => sh.id === selectedShapeId) ?? null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!pdf || signModalOpen) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      // Only real text fields keep their own native undo; selects, colour pickers,
      // sliders and buttons must not swallow Ctrl+Z / Ctrl+Y.
      const textTypes = ['text', 'search', 'number', 'email', 'url', 'tel', 'password', '']
      const isTextField =
        tag === 'TEXTAREA' ||
        el?.isContentEditable === true ||
        (tag === 'INPUT' && textTypes.includes((el as HTMLInputElement).type ?? ''))
      if (isTextField) return

      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'a') {
        // Select the text of the page only, not the whole application window
        e.preventDefault()
        const layer = viewportRef.current?.querySelector('.textLayer')
        const sel = window.getSelection()
        if (layer && sel) {
          const range = document.createRange()
          range.selectNodeContents(layer)
          sel.removeAllRanges()
          sel.addRange(range)
        }
        return
      }
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()
        duplicateAnnotation(selectedId)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShape) {
        e.preventDefault()
        handleReplacePdfShape(selectedShape, null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        deleteAnnotation(selectedId)
        return
      }
      if (e.key === 'Enter' && selectedId && tag !== 'BUTTON') {
        const target = annotationsRef.current.find((a) => a.id === selectedId)
        if (target?.type === 'text') {
          e.preventDefault()
          setEditingTextId(target.id)
          return
        }
      }
      if (e.key === 'Escape') {
        setSelectedId(null)
        setSelectedShapeId(null)
        setEditingTextId(null)
        setTool('select')
        return
      }
      if (!selectedId) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(currentIndex + 2)
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(currentIndex)
      }
      if (e.key === '+' || e.key === '=') zoomBy(+0.2)
      if (e.key === '-') zoomBy(-0.2)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    pdf,
    signModalOpen,
    selectedId,
    selectedShape,
    handleReplacePdfShape,
    currentIndex,
    undo,
    redo,
    duplicateAnnotation,
    deleteAnnotation,
    goTo,
    zoomBy,
  ])

  // ── Selected annotation property updates ───────────────────────────────────
  const selectedAnn = annotations.find((a) => a.id === selectedId) ?? null

  const updateSelected = (patch: Partial<Annotation>) => {
    if (!selectedAnn) return
    updateAnnotation(selectedAnn.id, patch, true)
  }

  // ── Empty / Loading views ──────────────────────────────────────────────────
  if (!pdf && !loading) {
    return (
      <div className="flex flex-1 flex-col">
        {error && (
          <div className="mx-auto mt-6 w-full max-w-lg rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
        <DropZone onFile={loadFile} onNewBlank={() => void createBlankPdf()} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="size-10 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
        <p className="text-sm text-[var(--color-text-tertiary)]">{t('tools.pdfEditor.loading')}</p>
      </div>
    )
  }

  const pageAnnotations = currentEntry
    ? annotations.filter((a) => a.pageId === currentEntry.id)
    : []

  const showTextProps = tool === 'text' || selectedAnn?.type === 'text'
  const showStrokeProps =
    tool === 'draw' ||
    tool === 'rect' ||
    tool === 'ellipse' ||
    tool === 'polygon' ||
    tool === 'line' ||
    tool === 'arrow' ||
    selectedAnn?.type === 'draw' ||
    selectedAnn?.type === 'rect' ||
    selectedAnn?.type === 'ellipse' ||
    selectedAnn?.type === 'polygon' ||
    selectedAnn?.type === 'line' ||
    selectedAnn?.type === 'arrow'
  const showFillToggle =
    tool === 'rect' ||
    tool === 'ellipse' ||
    tool === 'polygon' ||
    selectedAnn?.type === 'rect' ||
    selectedAnn?.type === 'ellipse' ||
    selectedAnn?.type === 'polygon'
  const showHighlightProps = tool === 'highlight' || selectedAnn?.type === 'highlight'
  const showRedactProps = tool === 'redact' || selectedAnn?.type === 'redact'
  const showColorProps = showTextProps || showStrokeProps
  const hasContextual =
    showColorProps ||
    showHighlightProps ||
    showRedactProps ||
    tool === 'edit-text' ||
    tool === 'edit-shape'

  const activeColor = selectedAnn && 'color' in selectedAnn ? selectedAnn.color : styleConfig.color
  const activeStroke =
    selectedAnn && 'strokeWidth' in selectedAnn ? selectedAnn.strokeWidth : styleConfig.strokeWidth
  const activeFill =
    selectedAnn && 'fillColor' in selectedAnn ? selectedAnn.fillColor : styleConfig.fillColor

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Row 1: Document, Navigation, Zoom, Export ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
        <Button
          variant={showSidebar ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={() => setShowSidebar((v) => !v)}
          title={t('tools.pdfEditor.pagesSidebar')}
          aria-label={t('tools.pdfEditor.pagesSidebar')}
        >
          <PanelLeft className="size-4" />
        </Button>

        <div className="mx-1 flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0 text-[var(--color-accent)]" />
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
            {pdf ? formatFileName(pdf.name) : ''}
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => openFileInputRef.current?.click()}
          title={t('tools.pdfEditor.openAnother')}
          aria-label={t('tools.pdfEditor.openAnother')}
        >
          <FolderOpen className="size-4" />
        </Button>
        <input
          ref={openFileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void loadFile(f)
          }}
        />

        <ToolbarSeparator />

        {/* Undo / Redo */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={undo}
          disabled={historyIdx <= 0}
          title={t('tools.pdfEditor.undo')}
          aria-label={t('tools.pdfEditor.undo')}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={redo}
          disabled={historyIdx >= history.length - 1}
          title={t('tools.pdfEditor.redo')}
          aria-label={t('tools.pdfEditor.redo')}
        >
          <Redo2 className="size-4" />
        </Button>

        <ToolbarSeparator />

        {/* Page navigation */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goTo(currentIndex)}
          disabled={currentIndex <= 0}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
          <input
            type="number"
            min={1}
            max={pages.length}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => goTo(Number(pageInput))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goTo(Number(pageInput))
            }}
            className="w-11 rounded-md border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-center text-xs focus:border-[var(--color-accent)] focus:outline-none"
            aria-label={t('tools.pdfEditor.page')}
          />
          <span className="text-[var(--color-text-tertiary)]">/ {pages.length}</span>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goTo(currentIndex + 2)}
          disabled={currentIndex >= pages.length - 1}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>

        <ToolbarSeparator />

        {/* Zoom */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomBy(-0.2)}
          aria-label={t('tools.pdfEditor.zoomOut')}
          title={t('tools.pdfEditor.zoomOut')}
        >
          <ZoomOut className="size-4" />
        </Button>
        <span className="min-w-[3rem] text-center text-xs tabular-nums text-[var(--color-text-secondary)]">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomBy(+0.2)}
          aria-label={t('tools.pdfEditor.zoomIn')}
          title={t('tools.pdfEditor.zoomIn')}
        >
          <ZoomIn className="size-4" />
        </Button>
        <Button
          variant={zoomMode === 'fit-width' ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={() => applyZoomMode('fit-width')}
          aria-label={t('tools.pdfEditor.fitWidth')}
          title={t('tools.pdfEditor.fitWidth')}
        >
          <AlignJustify className="size-4" />
        </Button>
        <Button
          variant={zoomMode === 'fit-page' ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={() => applyZoomMode('fit-page')}
          aria-label={t('tools.pdfEditor.fitPage')}
          title={t('tools.pdfEditor.fitPage')}
        >
          <Maximize2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setZoomMode('custom')
            setScale(1.2)
          }}
          aria-label={t('tools.pdfEditor.resetZoom')}
          title={t('tools.pdfEditor.resetZoom')}
        >
          <RotateCcw className="size-3.5" />
        </Button>

        {/* Right side: Export + Close */}
        <div className="ml-auto flex items-center gap-2">
          {exportNotice && (
            <span className="hidden items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 sm:inline-flex">
              <Check className="size-3.5" />
              {exportNotice}
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <Download className="size-3.5" />
            {exporting ? t('tools.pdfEditor.exporting') : t('tools.pdfEditor.export')}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setPdf(null)
              setPageProxy(null)
              setPages([])
              setAnnotations([])
              setSuppressions([])
              suppressionsRef.current = []
              setHistory([{ annotations: [], suppressions: [] }])
              setHistoryIdx(0)
              setError(null)
            }}
            aria-label={t('tools.pdfEditor.close')}
            title={t('tools.pdfEditor.close')}
            className="text-[var(--color-text-tertiary)] hover:text-red-500"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Row 2: tools ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
        {(() => {
          const toolBtn = (
            id: EditorTool,
            Icon: React.ElementType,
            label: string,
          ) => {
            const active = tool === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTool(id)
                  setShapesOpen(false)
                  setSelectedShapeId(null)
                  if (id !== 'select') {
                    setSelectedId(null)
                    setEditingTextId(null)
                  }
                }}
                title={label}
                aria-label={label}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors',
                  active
                    ? 'bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]',
                )}
              >
                <Icon className="size-4" />
                <span className="hidden xl:inline">{label}</span>
              </button>
            )
          }
          const SHAPE_GROUPS: { label: string; items: string[] }[] = [
            { label: t('tools.pdfEditor.shapes.lines'), items: ['line', 'arrow'] },
            { label: t('tools.pdfEditor.shapes.basic'), items: ['rect', 'ellipse', 'triangle', 'right-triangle', 'diamond'] },
            { label: t('tools.pdfEditor.shapes.more'), items: ['pentagon', 'hexagon', 'octagon', 'star', 'star4', 'cross', 'block-arrow', 'chevron', 'trapezoid', 'parallelogram'] },
          ]
          const shapeTools: EditorTool[] = ['rect', 'ellipse', 'polygon', 'line', 'arrow']
          const shapeActive = shapeTools.includes(tool)
          const currentShape =
            tool === 'polygon' ? styleConfig.polygonKind : shapeActive ? tool : lastShape
          const pickShape = (id: string) => {
            setLastShape(id)
            if (id === 'rect' || id === 'ellipse' || id === 'line' || id === 'arrow') {
              setTool(id)
            } else {
              setStyleConfig((s) => ({ ...s, polygonKind: id as PolygonKind }))
              setTool('polygon')
            }
            setSelectedId(null)
            setSelectedShapeId(null)
            setEditingTextId(null)
            setShapesOpen(false)
          }
          return (
            <>
              {toolBtn('select', MousePointer2, t('tools.pdfEditor.tools.select'))}
              <ToolbarSeparator />
              {toolBtn('text', Type, t('tools.pdfEditor.tools.text'))}
              {toolBtn('edit-text', TextCursorInput, t('tools.pdfEditor.tools.editText'))}
              <ToolbarSeparator />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShapesOpen((v) => !v)}
                  title={t('tools.pdfEditor.shapes.menu')}
                  aria-haspopup="menu"
                  aria-expanded={shapesOpen}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors',
                    shapeActive
                      ? 'bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]',
                  )}
                >
                  <ShapeIcon shape={currentShape} className="size-4" />
                  <span className="hidden xl:inline">{t('tools.pdfEditor.shapes.menu')}</span>
                  <ChevronDown className="size-3 opacity-60" />
                </button>
                {shapesOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShapesOpen(false)} />
                    <div
                      role="menu"
                      className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-lg)]"
                    >
                      {SHAPE_GROUPS.map((g) => (
                        <div key={g.label} className="mb-2 last:mb-0">
                          <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                            {g.label}
                          </p>
                          <div className="grid grid-cols-5 gap-1">
                            {g.items.map((id) => {
                              const on = shapeActive && currentShape === id
                              const name = t(`tools.pdfEditor.shapes.${id}`)
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  role="menuitem"
                                  title={name}
                                  aria-label={name}
                                  onClick={() => pickShape(id)}
                                  className={cn(
                                    'flex size-10 items-center justify-center rounded-lg transition-colors',
                                    on
                                      ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]',
                                  )}
                                >
                                  <ShapeIcon shape={id} className="size-5" />
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {toolBtn('edit-shape', BoxSelect, t('tools.pdfEditor.tools.editShape'))}
              <ToolbarSeparator />
              {toolBtn('draw', PenTool, t('tools.pdfEditor.tools.draw'))}
              {toolBtn('highlight', Highlighter, t('tools.pdfEditor.tools.highlight'))}
              {toolBtn('redact', Eraser, t('tools.pdfEditor.tools.redact'))}
              <ToolbarSeparator />
            </>
          )
        })()}

        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          title={t('tools.pdfEditor.tools.image')}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]"
        >
          <ImagePlus className="size-4" />
          <span className="hidden xl:inline">{t('tools.pdfEditor.tools.image')}</span>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleImagePick}
        />
        <button
          type="button"
          onClick={() => setSignModalOpen(true)}
          title={t('tools.pdfEditor.tools.sign')}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]"
        >
          <Signature className="size-4" />
          <span className="hidden xl:inline">{t('tools.pdfEditor.tools.sign')}</span>
        </button>
      </div>

      {/* ── Row 3: options of the active tool. Fixed height so the page below never jumps ── */}
      <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 [&>*]:shrink-0">
        {tool === 'edit-text' && (
          <span className="px-1 text-xs font-medium text-[var(--color-accent)]">
            {t('tools.pdfEditor.props.editTextHint')}
          </span>
        )}

        {tool === 'edit-shape' && (
          <span className="px-1 text-xs font-medium text-[var(--color-accent)]">
            {t('tools.pdfEditor.props.editShapeHint')}
          </span>
        )}

        {!hasContextual && (
          <span className="px-1 text-xs text-[var(--color-text-tertiary)]">
            {tool === 'select'
              ? t('tools.pdfEditor.props.selectHint')
              : t('tools.pdfEditor.props.noOptions')}
          </span>
        )}

        {/* Color swatches */}
        {showColorProps && (
          <div className="flex items-center gap-1 px-1">
            {COLOR_SWATCHES.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => {
                  setStyleConfig((s) => ({ ...s, color: col }))
                  if (selectedAnn && 'color' in selectedAnn) updateSelected({ color: col })
                }}
                className={cn(
                  'size-4 rounded-full border transition-transform',
                  activeColor === col
                    ? 'scale-125 border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30'
                    : 'border-[var(--color-border)]',
                )}
                style={{ backgroundColor: col }}
                aria-label={col}
              />
            ))}
            <input
              type="color"
              value={activeColor}
              onChange={(e) => {
                const col = e.target.value
                setStyleConfig((s) => ({ ...s, color: col }))
                if (selectedAnn && 'color' in selectedAnn) updateSelected({ color: col })
              }}
              className="ml-1 size-5 cursor-pointer rounded border-0 bg-transparent p-0"
              title={t('tools.pdfEditor.props.color')}
            />
          </div>
        )}

        {/* Highlight swatches */}
        {showHighlightProps && (
          <div className="flex items-center gap-1 px-1">
            {HIGHLIGHT_SWATCHES.map((col) => {
              const cur =
                selectedAnn?.type === 'highlight' ? selectedAnn.color : styleConfig.highlightColor
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => {
                    setStyleConfig((s) => ({ ...s, highlightColor: col }))
                    if (selectedAnn?.type === 'highlight') updateSelected({ color: col })
                  }}
                  className={cn(
                    'size-4 rounded-full border transition-transform',
                    cur === col
                      ? 'scale-125 border-[var(--color-accent)]'
                      : 'border-[var(--color-border)]',
                  )}
                  style={{ backgroundColor: col }}
                  aria-label={col}
                />
              )
            })}
          </div>
        )}

        {/* Redact color: Whiteout vs Blackout */}
        {showRedactProps && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setStyleConfig((s) => ({ ...s, redactColor: '#ffffff' }))
                if (selectedAnn?.type === 'redact') {
                  updateSelected({ color: '#ffffff', fillColor: '#ffffff' })
                }
              }}
              className={cn(
                'rounded-md border px-2 py-1 text-xs font-medium',
                (selectedAnn?.type === 'redact' ? selectedAnn.fillColor : styleConfig.redactColor) ===
                  '#ffffff'
                  ? 'border-[var(--color-accent)] bg-white text-slate-900'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]',
              )}
            >
              {t('tools.pdfEditor.props.whiteout')}
            </button>
            <button
              type="button"
              onClick={() => {
                setStyleConfig((s) => ({ ...s, redactColor: '#000000' }))
                if (selectedAnn?.type === 'redact') {
                  updateSelected({ color: '#000000', fillColor: '#000000' })
                }
              }}
              className={cn(
                'rounded-md border px-2 py-1 text-xs font-medium',
                (selectedAnn?.type === 'redact' ? selectedAnn.fillColor : styleConfig.redactColor) ===
                  '#000000'
                  ? 'border-[var(--color-accent)] bg-black text-white'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]',
              )}
            >
              {t('tools.pdfEditor.props.blackout')}
            </button>
          </div>
        )}

        {/* Text properties */}
        {showTextProps && (
          <div className="flex items-center gap-1.5 pl-1">
            <select
              value={selectedAnn?.type === 'text' ? selectedAnn.fontFamily : styleConfig.fontFamily}
              onChange={(e) => {
                const fontFamily = e.target.value as FontFamily
                setStyleConfig((s) => ({ ...s, fontFamily }))
                if (selectedAnn?.type === 'text') updateSelected({ fontFamily, letterSpacing: 0 })
              }}
              className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)]"
              aria-label={t('tools.pdfEditor.props.fontFamily')}
            >
              <option value="Helvetica">Sans (Helvetica)</option>
              <option value="TimesRoman">Serif (Times)</option>
              <option value="Courier">Mono (Courier)</option>
            </select>

            <select
              value={selectedAnn?.type === 'text' ? selectedAnn.fontSize : styleConfig.fontSize}
              onChange={(e) => {
                const fontSize = Number(e.target.value)
                setStyleConfig((s) => ({ ...s, fontSize }))
                if (selectedAnn?.type === 'text') updateSelected({ fontSize, letterSpacing: 0 })
              }}
              className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-xs text-[var(--color-text-primary)]"
              aria-label={t('tools.pdfEditor.props.fontSize')}
            >
              {withCurrent(
                [10, 12, 14, 16, 18, 22, 26, 32, 42, 56],
                selectedAnn?.type === 'text' ? selectedAnn.fontSize : styleConfig.fontSize,
              ).map((sz) => (
                <option key={sz} value={sz}>
                  {fmtNum(sz)}px
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                const next =
                  selectedAnn?.type === 'text' ? !selectedAnn.bold : !styleConfig.bold
                setStyleConfig((s) => ({ ...s, bold: next }))
                if (selectedAnn?.type === 'text') updateSelected({ bold: next, letterSpacing: 0 })
              }}
              title={t('tools.pdfEditor.props.bold')}
              className={cn(
                'flex size-7 items-center justify-center rounded-md border text-xs',
                (selectedAnn?.type === 'text' ? selectedAnn.bold : styleConfig.bold)
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]',
              )}
            >
              <Bold className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                const next =
                  selectedAnn?.type === 'text' ? !selectedAnn.italic : !styleConfig.italic
                setStyleConfig((s) => ({ ...s, italic: next }))
                if (selectedAnn?.type === 'text') updateSelected({ italic: next, letterSpacing: 0 })
              }}
              title={t('tools.pdfEditor.props.italic')}
              className={cn(
                'flex size-7 items-center justify-center rounded-md border text-xs',
                (selectedAnn?.type === 'text' ? selectedAnn.italic : styleConfig.italic)
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]',
              )}
            >
              <Italic className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                const cur =
                  selectedAnn?.type === 'text'
                    ? selectedAnn.backgroundColor
                    : styleConfig.textBgColor
                const next = cur ? null : '#ffffff'
                setStyleConfig((s) => ({ ...s, textBgColor: next }))
                if (selectedAnn?.type === 'text') updateSelected({ backgroundColor: next })
              }}
              className={cn(
                'h-7 rounded-md border px-2 text-xs font-medium',
                (selectedAnn?.type === 'text'
                  ? selectedAnn.backgroundColor
                  : styleConfig.textBgColor) !== null
                  ? 'border-[var(--color-accent)] bg-white text-slate-900'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]',
              )}
            >
              {t('tools.pdfEditor.props.fillColor')}
            </button>
          </div>
        )}

        {/* Stroke width & Fill toggle */}
        {showStrokeProps && (
          <div className="flex items-center gap-1.5 pl-1">
            <select
              value={activeStroke}
              onChange={(e) => {
                const strokeWidth = Number(e.target.value)
                setStyleConfig((s) => ({ ...s, strokeWidth }))
                if (selectedAnn && 'strokeWidth' in selectedAnn) updateSelected({ strokeWidth })
              }}
              className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-xs text-[var(--color-text-primary)]"
              aria-label={t('tools.pdfEditor.props.strokeWidth')}
            >
              {withCurrent([1, 2, 3, 5, 8, 12], activeStroke).map((w) => (
                <option key={w} value={w}>
                  {fmtNum(w)}px
                </option>
              ))}
            </select>

            {showFillToggle && (
              <button
                type="button"
                onClick={() => {
                  const nextFill = activeFill ? null : activeColor
                  setStyleConfig((s) => ({ ...s, fillColor: nextFill }))
                  if (selectedAnn && 'fillColor' in selectedAnn) {
                    updateSelected({ fillColor: nextFill })
                  }
                }}
                className={cn(
                  'h-7 rounded-md border px-2 text-xs font-medium',
                  activeFill
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)]',
                )}
              >
                {activeFill
                  ? t('tools.pdfEditor.props.filled')
                  : t('tools.pdfEditor.props.outline')}
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Main Workspace: Sidebar + Canvas Viewport ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showSidebar && pdf && (
          <PageThumbnails
            doc={pdf.doc}
            pages={pages}
            currentIndex={currentIndex}
            annotations={annotations}
            onSelectPage={(idx) => {
              setCurrentIndex(idx)
              setPageInput(String(idx + 1))
            }}
            onRotatePage={rotatePage}
            onMirrorPage={mirrorPage}
            onDuplicatePage={duplicatePage}
            onDeletePage={deletePage}
            onMovePage={movePage}
            onReorderPage={reorderPage}
            onAddBlankPage={addBlankPage}
          />
        )}

        <div
          ref={viewportRef}
          className="flex min-w-0 flex-1 flex-col items-center overflow-auto overscroll-contain bg-[var(--color-surface-sunken)] px-6 py-8"
        >
          {currentEntry && (
            <div
              className="relative"
              style={currentEntry.mirrored ? { transform: 'scaleX(-1)' } : undefined}
              onPointerDown={() => {
                if (tool === 'select') {
                  setSelectedId(null)
                  setSelectedShapeId(null)
                  setEditingTextId(null)
                }
              }}
            >
              {pageLoading && (
                <div className="absolute inset-0 z-30 flex items-center justify-center rounded-sm bg-white/60 dark:bg-black/40">
                  <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
                </div>
              )}

              <PdfPageCanvas
                canvasRef={pageCanvasRef}
                page={pageProxy}
                userRotation={currentEntry.userRotation}
                blankSize={{
                  width: currentEntry.baseWidth,
                  height: currentEntry.baseHeight,
                }}
                scale={scale}
                onRendered={() => setPageLoading(false)}
              />

              <PdfTextLayer
                page={pageProxy}
                userRotation={currentEntry.userRotation}
                scale={scale}
                interactive={tool === 'select' && editingTextId === null}
              />

              <AnnotationLayer
                pageId={currentEntry.id}
                pdfjsPage={pageProxy}
                userRotation={currentEntry.userRotation}
                mirrored={!!currentEntry.mirrored}
                vpWidth={Math.round(vpSize.width * scale)}
                vpHeight={Math.round(vpSize.height * scale)}
                scale={scale}
                tool={tool}
                styleConfig={styleConfig}
                annotations={pageAnnotations}
                selectedId={selectedId}
                editingTextId={editingTextId}
                getPageCanvas={() => pageCanvasRef.current}
                pdfShapes={pageShapes}
                selectedShapeId={selectedShapeId}
                onSelect={(id) => {
                  setSelectedId(id)
                  if (id) setSelectedShapeId(null)
                }}
                onSelectShape={setSelectedShapeId}
                onEditingTextIdChange={setEditingTextId}
                onAddAnnotation={addAnnotation}
                onReplacePdfText={handleReplacePdfText}
                onReplacePdfShape={handleReplacePdfShape}
                onUpdateAnnotation={updateAnnotation}
                onCommitHistory={commitHistory}
                onDeleteAnnotation={deleteAnnotation}
                onDuplicateAnnotation={duplicateAnnotation}
                onToolUsed={() => setTool('select')}
              />
            </div>
          )}

          {/* Bottom page switcher */}
          {pages.length > 1 && (
            <div className="mt-6 flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goTo(currentIndex)}
                disabled={currentIndex <= 0}
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <span className="text-sm text-[var(--color-text-tertiary)]">
                {currentIndex + 1} / {pages.length}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goTo(currentIndex + 2)}
                disabled={currentIndex >= pages.length - 1}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Signature modal */}
      <SignatureModal
        open={signModalOpen}
        onClose={() => setSignModalOpen(false)}
        onInsert={(dataUrl, ratio) => insertImageOnPage(dataUrl, ratio, 'sign')}
      />
    </div>
  )
}
