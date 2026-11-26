import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ArrowDown, ArrowUp, Copy, FilePlus2, FlipHorizontal2, RotateCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Annotation, PageEntry } from './types'

function ThumbnailCanvas({
  doc,
  entry,
}: {
  doc: PDFDocumentProxy
  entry: PageEntry
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void; promise: Promise<void> } | null = null

    const render = async () => {
      const canvas = canvasRef.current
      if (!canvas) return

      if (entry.originalIndex === null) {
        const swapped = entry.userRotation === 90 || entry.userRotation === 270
        const w = swapped ? entry.baseHeight : entry.baseWidth
        const h = swapped ? entry.baseWidth : entry.baseHeight
        const scale = 120 / w
        canvas.width = Math.round(w * scale)
        canvas.height = Math.round(h * scale)
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        return
      }

      const page = await doc.getPage(entry.originalIndex + 1)
      if (cancelled) return
      const rot = (((page.rotate + entry.userRotation) % 360 + 360) % 360) as 0 | 90 | 180 | 270
      const vp1 = page.getViewport({ scale: 1, rotation: rot })
      const scale = 120 / vp1.width
      const vp = page.getViewport({ scale, rotation: rot })

      canvas.width = Math.round(vp.width)
      canvas.height = Math.round(vp.height)
      const ctx = canvas.getContext('2d')!
      task = page.render({ canvasContext: ctx, viewport: vp, canvas })
      try {
        await task.promise
      } catch {
        // Cancelled
      }
    }

    void render()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, entry.originalIndex, entry.userRotation, entry.baseWidth, entry.baseHeight])

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        'mx-auto block rounded-sm border border-[var(--color-border)] bg-white shadow-xs',
        entry.mirrored && '-scale-x-100',
      )}
    />
  )
}

export function PageThumbnails({
  doc,
  pages,
  currentIndex,
  annotations,
  onSelectPage,
  onRotatePage,
  onMirrorPage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
  onReorderPage,
  onAddBlankPage,
}: {
  doc: PDFDocumentProxy
  pages: PageEntry[]
  currentIndex: number
  annotations: Annotation[]
  onSelectPage: (index: number) => void
  onRotatePage: (index: number) => void
  onMirrorPage: (index: number) => void
  onDuplicatePage: (index: number) => void
  onDeletePage: (index: number) => void
  onMovePage: (index: number, dir: -1 | 1) => void
  /** Drag and drop: move the page at `from` so that it ends up at index `to` */
  onReorderPage: (from: number, to: number) => void
  onAddBlankPage: () => void
}) {
  const { t } = useTranslation()
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  /** Slot where the page would be inserted (0 = before the first page, n = after the last) */
  const [slot, setSlot] = useState<number | null>(null)

  const endDrag = () => {
    setDragFrom(null)
    setSlot(null)
  }

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-raised)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          {t('tools.pdfEditor.pagesSidebar')} ({pages.length})
        </span>
        <button
          type="button"
          onClick={onAddBlankPage}
          title={t('tools.pdfEditor.addBlankPage')}
          className="inline-flex size-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-accent)]"
        >
          <FilePlus2 className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-2.5">
        {pages.map((entry, idx) => {
          const active = idx === currentIndex
          const count = annotations.filter((a) => a.pageId === entry.id).length

          return (
            <div
              key={entry.id}
              draggable
              onDragStart={(e) => {
                setDragFrom(idx)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(idx))
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const r = e.currentTarget.getBoundingClientRect()
                const next = e.clientY < r.top + r.height / 2 ? idx : idx + 1
                setSlot((cur) => (cur === next ? cur : next))
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragFrom !== null && slot !== null) {
                  const to = dragFrom < slot ? slot - 1 : slot
                  if (to !== dragFrom) onReorderPage(dragFrom, to)
                }
                endDrag()
              }}
              onDragEnd={endDrag}
              onClick={() => onSelectPage(idx)}
              className={cn(
                'group relative cursor-grab rounded-xl border p-2 transition-all active:cursor-grabbing',
                dragFrom === idx && 'opacity-40',
                dragFrom !== null && slot === idx && dragFrom !== idx && 'before:absolute before:-top-[7px] before:left-1 before:right-1 before:h-0.5 before:rounded-full before:bg-[var(--color-accent)]',
                dragFrom !== null && slot === idx + 1 && slot === pages.length && dragFrom !== idx && 'after:absolute after:-bottom-[7px] after:left-1 after:right-1 after:h-0.5 after:rounded-full after:bg-[var(--color-accent)]',
                active
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] ring-2 ring-[var(--color-accent)]/20'
                  : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]',
              )}
            >
              <ThumbnailCanvas doc={doc} entry={entry} />

              <div className="mt-1.5 flex items-center justify-between px-1">
                <span
                  className={cn(
                    'text-xs font-medium tabular-nums',
                    active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]',
                  )}
                >
                  {idx + 1}
                </span>
                {count > 0 && (
                  <span className="rounded-full bg-[var(--color-accent)] px-1.5 py-0.2 text-[10px] font-semibold text-white">
                    {count}
                  </span>
                )}
              </div>

              {/* Page actions (always visible) */}
              <div
                className="mt-1.5 flex items-center justify-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onRotatePage(idx)}
                  title={t('tools.pdfEditor.rotatePage')}
                  className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]"
                >
                  <RotateCw className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onMirrorPage(idx)}
                  title={t('tools.pdfEditor.mirrorPage')}
                  aria-pressed={!!entry.mirrored}
                  className={cn(
                    'rounded p-1 hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]',
                    entry.mirrored
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)]',
                  )}
                >
                  <FlipHorizontal2 className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onMovePage(idx, -1)}
                  disabled={idx === 0}
                  title={t('tools.pdfEditor.movePageUp')}
                  className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] disabled:opacity-30"
                >
                  <ArrowUp className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onMovePage(idx, 1)}
                  disabled={idx === pages.length - 1}
                  title={t('tools.pdfEditor.movePageDown')}
                  className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] disabled:opacity-30"
                >
                  <ArrowDown className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicatePage(idx)}
                  title={t('tools.pdfEditor.duplicatePage')}
                  className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]"
                >
                  <Copy className="size-3" />
                </button>
                {pages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeletePage(idx)}
                    title={t('tools.pdfEditor.deletePage')}
                    className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
