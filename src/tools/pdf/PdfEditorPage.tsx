import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  RotateCcw,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlignJustify,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// ── pdf.js dynamic import (keeps it code-split and avoids SSR issues) ──────────
type PDFDocumentProxy = import('pdfjs-dist').PDFDocumentProxy
type PDFPageProxy    = import('pdfjs-dist').PDFPageProxy

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  // Use the CDN worker so we don't need to copy it ourselves
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  return pdfjs
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatFileName(name: string, maxLen = 40) {
  if (name.length <= maxLen) return name
  const ext = name.slice(name.lastIndexOf('.'))
  return name.slice(0, maxLen - ext.length - 3) + '…' + ext
}

// ── Types ───────────────────────────────────────────────────────────────────
interface PdfState {
  doc: PDFDocumentProxy
  name: string
  numPages: number
}

type ZoomMode = 'custom' | 'fit-width' | 'fit-page'

// ── Sub-components ───────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file?.type === 'application/pdf') onFile(file)
    },
    [onFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        aria-label={t('tools.pdfEditor.dropzone')}
        className={cn(
          'group relative flex w-full max-w-lg flex-col items-center gap-6 rounded-3xl border-2 border-dashed p-16 transition-all duration-200 cursor-pointer select-none',
          dragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] scale-[1.01]'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]',
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            'flex size-20 items-center justify-center rounded-2xl border-2 transition-colors',
            dragging
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
              : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text-tertiary)] group-hover:border-[var(--color-accent)] group-hover:bg-[var(--color-accent)] group-hover:text-white',
          )}
        >
          <FileText className="size-9" aria-hidden />
        </div>

        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('tools.pdfEditor.dropzone')}
          </p>
          <p className="mt-1.5 text-sm text-[var(--color-text-tertiary)]">
            {t('tools.pdfEditor.dropzoneOr')}
          </p>
          <div
            className={cn(
              'mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors',
              'bg-[var(--color-accent)] text-white shadow-sm group-hover:bg-[var(--color-accent-hover)]',
            )}
          >
            <Upload className="size-4" />
            {t('tools.pdfEditor.browse')}
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-disabled)]">PDF only</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={handleChange}
        tabIndex={-1}
      />
    </div>
  )
}

// ── Page canvas ──────────────────────────────────────────────────────────────
function PdfPageCanvas({
  page,
  scale,
  onRendered,
}: {
  page: PDFPageProxy
  scale: number
  onRendered?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTask = useRef<{ cancel: () => void } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Cancel any in-progress render
    renderTask.current?.cancel()

    const viewport = page.getViewport({ scale })
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1

    canvas.width  = Math.round(viewport.width  * dpr)
    canvas.height = Math.round(viewport.height * dpr)
    canvas.style.width  = `${Math.round(viewport.width)}px`
    canvas.style.height = `${Math.round(viewport.height)}px`

    ctx.scale(dpr, dpr)

    const task = page.render({ canvasContext: ctx, viewport, canvas })
    renderTask.current = task

    task.promise.then(() => { onRendered?.() }).catch(() => { /* cancelled */ })

    return () => { task.cancel() }
  }, [page, scale, onRendered])

  return (
    <canvas
      ref={canvasRef}
      className="block shadow-xl rounded-sm"
      style={{ maxWidth: '100%' }}
    />
  )
}

// ── Toolbar button wrapper ───────────────────────────────────────────────────
function ToolbarSeparator() {
  return <div className="mx-1 h-5 w-px bg-[var(--color-border)]" aria-hidden />
}

// ── Main editor ─────────────────────────────────────────────────────────────
export default function PdfEditorPage() {
  const { t } = useTranslation()
  const [pdf, setPdf]           = useState<PdfState | null>(null)
  const [page, setPage]         = useState<PDFPageProxy | null>(null)
  const [currentPage, setCurrent] = useState(1)
  const [scale, setScale]       = useState(1.2)
  const [zoomMode, setZoomMode] = useState<ZoomMode>('custom')
  const [loading, setLoading]   = useState(false)
  const [pageLoading, setPageLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [pageInput, setPageInput] = useState('1')
  const viewportRef = useRef<HTMLDivElement>(null)

  // ── Load file ──────────────────────────────────────────────────────────────
  const loadFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    setPage(null)
    setPdf(null)
    setCurrent(1)
    setPageInput('1')
    try {
      const pdfjs = await loadPdfJs()
      const buffer = await file.arrayBuffer()
      const doc = await pdfjs.getDocument({ data: buffer }).promise
      setPdf({ doc, name: file.name, numPages: doc.numPages })
    } catch {
      setError(t('tools.pdfEditor.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  // ── Load page when pdf or currentPage changes ──────────────────────────────
  useEffect(() => {
    if (!pdf) return
    setPageLoading(true)
    pdf.doc.getPage(currentPage).then((p) => {
      setPage(p)
    })
  }, [pdf, currentPage])

  // ── Zoom helpers ───────────────────────────────────────────────────────────
  const computeFitScale = useCallback((mode: 'fit-width' | 'fit-page') => {
    if (!page || !viewportRef.current) return scale
    const vp     = page.getViewport({ scale: 1 })
    const avail  = viewportRef.current.getBoundingClientRect()
    if (mode === 'fit-width') {
      return Math.max(0.3, (avail.width - 48) / vp.width)
    } else {
      const ws = (avail.width - 48)  / vp.width
      const hs = (avail.height - 48) / vp.height
      return Math.max(0.3, Math.min(ws, hs))
    }
  }, [page, scale])

  const applyZoomMode = useCallback((mode: ZoomMode) => {
    setZoomMode(mode)
    if (mode === 'fit-width' || mode === 'fit-page') {
      const s = computeFitScale(mode)
      setScale(s)
    }
  }, [computeFitScale])

  const zoomBy = useCallback((delta: number) => {
    setZoomMode('custom')
    setScale((s) => Math.min(5, Math.max(0.3, parseFloat((s + delta).toFixed(2)))))
  }, [])

  // ── Page navigation ────────────────────────────────────────────────────────
  const goTo = useCallback((n: number) => {
    if (!pdf) return
    const clamped = Math.max(1, Math.min(pdf.numPages, n))
    setCurrent(clamped)
    setPageInput(String(clamped))
  }, [pdf])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!pdf) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(currentPage + 1)
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   goTo(currentPage - 1)
      if (e.key === '+' || e.key === '=') zoomBy(+0.2)
      if (e.key === '-')                   zoomBy(-0.2)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pdf, currentPage, goTo, zoomBy])

  const zoomPct = `${Math.round(scale * 100)}%`

  // ── No file: show dropzone ─────────────────────────────────────────────────
  if (!pdf && !loading) {
    return (
      <div className="flex flex-1 flex-col">
        {error && (
          <div className="mx-auto mt-6 w-full max-w-lg rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
        <DropZone onFile={loadFile} />
      </div>
    )
  }

  // ── Loading spinner ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="size-10 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
        <p className="text-sm text-[var(--color-text-tertiary)]">{t('tools.pdfEditor.loading')}</p>
      </div>
    )
  }

  // ── Editor ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        {/* File name */}
        <div className="flex min-w-0 items-center gap-2 mr-2">
          <FileText className="size-4 shrink-0 text-[var(--color-accent)]" />
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
            {pdf ? formatFileName(pdf.name) : ''}
          </span>
        </div>

        <ToolbarSeparator />

        {/* Page navigation */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          <input
            type="number"
            min={1}
            max={pdf?.numPages ?? 1}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => goTo(Number(pageInput))}
            onKeyDown={(e) => { if (e.key === 'Enter') goTo(Number(pageInput)) }}
            className="w-12 rounded-md border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-center text-sm focus:border-[var(--color-accent)] focus:outline-none"
            aria-label={t('tools.pdfEditor.page')}
          />
          <span className="text-[var(--color-text-tertiary)]">/ {pdf?.numPages}</span>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goTo(currentPage + 1)}
          disabled={!pdf || currentPage >= pdf.numPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>

        <ToolbarSeparator />

        {/* Zoom */}
        <Button variant="ghost" size="icon-sm" onClick={() => zoomBy(-0.2)} aria-label={t('tools.pdfEditor.zoomOut')}>
          <ZoomOut className="size-4" />
        </Button>

        <span className="min-w-[3.5rem] text-center text-sm tabular-nums text-[var(--color-text-secondary)]">
          {zoomPct}
        </span>

        <Button variant="ghost" size="icon-sm" onClick={() => zoomBy(+0.2)} aria-label={t('tools.pdfEditor.zoomIn')}>
          <ZoomIn className="size-4" />
        </Button>

        <ToolbarSeparator />

        {/* Fit modes */}
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
          onClick={() => { setZoomMode('custom'); setScale(1.2) }}
          aria-label="Reset zoom"
          title="Reset zoom (100%)"
        >
          <RotateCcw className="size-4" />
        </Button>

        <ToolbarSeparator />

        {/* Close */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => { setPdf(null); setPage(null); setError(null) }}
          aria-label={t('tools.pdfEditor.close')}
          title={t('tools.pdfEditor.close')}
          className="ml-auto text-[var(--color-text-tertiary)] hover:text-red-500"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* ── Page viewport ── */}
      <div
        ref={viewportRef}
        className="flex flex-1 flex-col items-center overflow-auto bg-[var(--color-surface-sunken)] px-6 py-8"
      >
        {pageLoading && !page && (
          <div className="flex flex-col items-center gap-3 py-24">
            <div className="size-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
            <p className="text-sm text-[var(--color-text-tertiary)]">{t('tools.pdfEditor.pageLoading')}</p>
          </div>
        )}

        {page && (
          <div className="relative">
            {pageLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-sm bg-white/60 dark:bg-black/40">
                <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
              </div>
            )}
            <PdfPageCanvas
              page={page}
              scale={scale}
              onRendered={() => setPageLoading(false)}
            />
          </div>
        )}

        {/* Bottom navigation */}
        {pdf && pdf.numPages > 1 && (
          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => goTo(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <span className="text-sm text-[var(--color-text-tertiary)]">
              {currentPage} / {pdf.numPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => goTo(currentPage + 1)}
              disabled={currentPage >= pdf.numPages}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
