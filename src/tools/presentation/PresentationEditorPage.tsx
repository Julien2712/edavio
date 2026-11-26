import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PptxGenJS from 'pptxgenjs'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  ImagePlus,
  Italic,
  Palette,
  Play,
  Plus,
  Presentation,
  Square,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const SLIDE_W = 960
const SLIDE_H = 540

const BG_THEMES = [
  { id: 'white', bg: '#ffffff', text: '#0f172a', label: 'Clair' },
  { id: 'slate', bg: '#0f172a', text: '#f8fafc', label: 'Nuit' },
  { id: 'indigo', bg: '#1e1b4b', text: '#eef2ff', label: 'Indigo' },
  { id: 'emerald', bg: '#064e3b', text: '#ecfdf5', label: 'Émeraude' },
  { id: 'cream', bg: '#fefce8', text: '#27272a', label: 'Crème' },
]

const ELEMENT_COLORS = ['#0f172a', '#ffffff', '#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626']

type SlideElement =
  | {
      id: string
      kind: 'text'
      x: number
      y: number
      w: number
      h: number
      text: string
      fontSize: number
      bold: boolean
      italic: boolean
      color: string
      align: 'left' | 'center' | 'right'
    }
  | {
      id: string
      kind: 'shape'
      shape: 'rect' | 'ellipse'
      x: number
      y: number
      w: number
      h: number
      fill: string
      stroke: string
    }
  | {
      id: string
      kind: 'image'
      x: number
      y: number
      w: number
      h: number
      dataUrl: string
    }

interface Slide {
  id: string
  bg: string
  elements: SlideElement[]
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function createTitleSlide(titleText: string, subtitleText: string): Slide {
  return {
    id: uid(),
    bg: '#ffffff',
    elements: [
      {
        id: uid(),
        kind: 'text',
        x: 80,
        y: 150,
        w: 800,
        h: 90,
        text: titleText,
        fontSize: 44,
        bold: true,
        italic: false,
        color: '#0f172a',
        align: 'center',
      },
      {
        id: uid(),
        kind: 'text',
        x: 140,
        y: 260,
        w: 680,
        h: 60,
        text: subtitleText,
        fontSize: 22,
        bold: false,
        italic: false,
        color: '#52525b',
        align: 'center',
      },
    ],
  }
}

function createContentSlide(headingText: string, bodyText: string, bg = '#ffffff', color = '#0f172a'): Slide {
  return {
    id: uid(),
    bg,
    elements: [
      {
        id: uid(),
        kind: 'text',
        x: 64,
        y: 48,
        w: 832,
        h: 64,
        text: headingText,
        fontSize: 32,
        bold: true,
        italic: false,
        color,
        align: 'left',
      },
      {
        id: uid(),
        kind: 'text',
        x: 64,
        y: 136,
        w: 832,
        h: 320,
        text: bodyText,
        fontSize: 20,
        bold: false,
        italic: false,
        color,
        align: 'left',
      },
    ],
  }
}

function SlidePreview({ slide, scale }: { slide: Slide; scale: number }) {
  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        width: `${SLIDE_W * scale}px`,
        height: `${SLIDE_H * scale}px`,
        backgroundColor: slide.bg,
      }}
    >
      {slide.elements.map((el) => {
        if (el.kind === 'shape') {
          return (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                left: `${el.x * scale}px`,
                top: `${el.y * scale}px`,
                width: `${el.w * scale}px`,
                height: `${el.h * scale}px`,
                backgroundColor: el.fill,
                border: `${Math.max(1, 2 * scale)}px solid ${el.stroke}`,
                borderRadius: el.shape === 'ellipse' ? '9999px' : `${8 * scale}px`,
              }}
            />
          )
        }
        if (el.kind === 'image') {
          return (
            <img
              key={el.id}
              src={el.dataUrl}
              alt=""
              style={{
                position: 'absolute',
                left: `${el.x * scale}px`,
                top: `${el.y * scale}px`,
                width: `${el.w * scale}px`,
                height: `${el.h * scale}px`,
                objectFit: 'contain',
              }}
            />
          )
        }
        return (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: `${el.x * scale}px`,
              top: `${el.y * scale}px`,
              width: `${el.w * scale}px`,
              height: `${el.h * scale}px`,
              fontSize: `${el.fontSize * scale}px`,
              fontWeight: el.bold ? 700 : 400,
              fontStyle: el.italic ? 'italic' : 'normal',
              color: el.color,
              textAlign: el.align,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.3,
            }}
          >
            {el.text}
          </div>
        )
      })}
    </div>
  )
}

export default function PresentationEditorPage() {
  const { t } = useTranslation()

  const [deckTitle, setDeckTitle] = useState(() => t('tools.presentationEditor.untitled'))
  const [slides, setSlides] = useState<Slide[]>(() => [
    createTitleSlide(t('tools.presentationEditor.defaultTitle'), t('tools.presentationEditor.defaultSubtitle')),
  ])
  const [activeIdx, setActiveIdx] = useState(0)
  const [selectedElId, setSelectedElId] = useState<string | null>(null)
  const [editingElId, setEditingElId] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [canvasScale, setCanvasScale] = useState(0.8)

  const stageWrapRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{
    mode: 'move' | 'resize'
    elId: string
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)

  const activeSlide = slides[activeIdx] ?? slides[0]!
  const selectedEl = activeSlide.elements.find((e) => e.id === selectedElId) ?? null

  // Responsive canvas scaling
  useEffect(() => {
    const updateScale = () => {
      const wrap = stageWrapRef.current
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()
      const sx = (rect.width - 48) / SLIDE_W
      const sy = (rect.height - 48) / SLIDE_H
      setCanvasScale(Math.max(0.35, Math.min(1.15, Math.min(sx, sy))))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  // Slideshow keyboard navigation
  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false)
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        setActiveIdx((i) => Math.min(slides.length - 1, i + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setActiveIdx((i) => Math.max(0, i - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, slides.length])

  const updateSlide = useCallback(
    (updater: (s: Slide) => Slide) => {
      setSlides((prev) => prev.map((s, idx) => (idx === activeIdx ? updater(s) : s)))
    },
    [activeIdx],
  )

  const updateElement = useCallback(
    (id: string, patch: Partial<SlideElement>) => {
      updateSlide((s) => ({
        ...s,
        elements: s.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as SlideElement) : el)),
      }))
    },
    [updateSlide],
  )

  const deleteElement = useCallback(
    (id: string) => {
      updateSlide((s) => ({ ...s, elements: s.elements.filter((el) => el.id !== id) }))
      if (selectedElId === id) setSelectedElId(null)
      if (editingElId === id) setEditingElId(null)
    },
    [editingElId, selectedElId, updateSlide],
  )

  const addText = useCallback(() => {
    const theme = BG_THEMES.find((th) => th.bg === activeSlide.bg)
    const el: SlideElement = {
      id: uid(),
      kind: 'text',
      x: 120,
      y: 180,
      w: 500,
      h: 80,
      text: t('tools.presentationEditor.newText'),
      fontSize: 24,
      bold: false,
      italic: false,
      color: theme?.text ?? '#0f172a',
      align: 'left',
    }
    updateSlide((s) => ({ ...s, elements: [...s.elements, el] }))
    setSelectedElId(el.id)
    setEditingElId(el.id)
  }, [activeSlide.bg, t, updateSlide])

  const addShape = useCallback(
    (shape: 'rect' | 'ellipse') => {
      const el: SlideElement = {
        id: uid(),
        kind: 'shape',
        shape,
        x: 340,
        y: 170,
        w: 220,
        h: 150,
        fill: '#4f46e5',
        stroke: '#312e81',
      }
      updateSlide((s) => ({ ...s, elements: [...s.elements, el] }))
      setSelectedElId(el.id)
    },
    [updateSlide],
  )

  const handleInsertImage = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const el: SlideElement = {
            id: uid(),
            kind: 'image',
            x: 240,
            y: 110,
            w: 420,
            h: 280,
            dataUrl: reader.result,
          }
          updateSlide((s) => ({ ...s, elements: [...s.elements, el] }))
          setSelectedElId(el.id)
        }
      }
      reader.readAsDataURL(file)
    },
    [updateSlide],
  )

  const handleExportPptx = useCallback(async () => {
    setExporting(true)
    try {
      const pres = new PptxGenJS()
      pres.layout = 'LAYOUT_16x9' // 10in x 5.625in
      pres.title = deckTitle

      const toInchesX = (px: number) => (px / SLIDE_W) * 10
      const toInchesY = (px: number) => (px / SLIDE_H) * 5.625

      for (const slideData of slides) {
        const slide = pres.addSlide()
        slide.background = { color: slideData.bg.replace('#', '') }

        for (const el of slideData.elements) {
          const x = toInchesX(el.x)
          const y = toInchesY(el.y)
          const w = toInchesX(el.w)
          const h = toInchesY(el.h)

          if (el.kind === 'text') {
            slide.addText(el.text, {
              x,
              y,
              w,
              h,
              fontSize: Math.round(el.fontSize * 0.75),
              bold: el.bold,
              italic: el.italic,
              color: el.color.replace('#', ''),
              align: el.align,
              valign: 'top',
            })
          } else if (el.kind === 'shape') {
            slide.addShape(
              el.shape === 'ellipse' ? pres.ShapeType.ellipse : pres.ShapeType.roundRect,
              {
                x,
                y,
                w,
                h,
                fill: { color: el.fill.replace('#', '') },
                line: { color: el.stroke.replace('#', ''), width: 1.5 },
              },
            )
          } else if (el.kind === 'image') {
            slide.addImage({
              data: el.dataUrl,
              x,
              y,
              w,
              h,
            })
          }
        }
      }

      const fileName = `${(deckTitle || t('tools.presentationEditor.untitled')).trim()}.pptx`
      await pres.writeFile({ fileName })
      setNotice(t('tools.presentationEditor.exportSuccess'))
      setTimeout(() => setNotice(null), 2500)
    } finally {
      setExporting(false)
    }
  }, [deckTitle, slides, t])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = (e.clientX - d.startX) / canvasScale
      const dy = (e.clientY - d.startY) / canvasScale
      if (d.mode === 'move') {
        updateElement(d.elId, {
          x: Math.round(d.origX + dx),
          y: Math.round(d.origY + dy),
        })
      } else {
        updateElement(d.elId, {
          w: Math.max(40, Math.round(d.origW + dx)),
          h: Math.max(28, Math.round(d.origH + dy)),
        })
      }
    },
    [canvasScale, updateElement],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        <Presentation className="size-4 shrink-0 text-orange-500" aria-hidden />
        <input
          type="text"
          value={deckTitle}
          onChange={(e) => setDeckTitle(e.target.value)}
          className="min-w-[140px] max-w-xs rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-[var(--color-text-primary)] hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none"
        />

        <div className="ml-auto flex items-center gap-1.5">
          {notice && (
            <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {notice}
            </span>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPresenting(true)}
            className="gap-1.5"
          >
            <Play className="size-3.5" />
            {t('tools.presentationEditor.present')}
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={exporting}
            onClick={() => void handleExportPptx()}
            className="gap-1.5"
          >
            <Download className="size-3.5" />
            {exporting ? t('tools.pdfEditor.exporting') : 'Exporter .pptx'}
          </Button>
        </div>
      </div>

      {/* ── Element toolbar ── */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-1.5">
        <Button variant="ghost" size="xs" onClick={addText} className="gap-1.5">
          <Type className="size-3.5" />
          {t('tools.pdfEditor.tools.text')}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => addShape('rect')} className="gap-1.5">
          <Square className="size-3.5" />
          {t('tools.pdfEditor.tools.rect')}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => addShape('ellipse')} className="gap-1.5">
          <Circle className="size-3.5" />
          {t('tools.pdfEditor.tools.ellipse')}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => imageInputRef.current?.click()} className="gap-1.5">
          <ImagePlus className="size-3.5" />
          {t('tools.pdfEditor.tools.image')}
        </Button>

        <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />

        {/* Slide background theme */}
        <div className="flex items-center gap-1">
          <Palette className="size-3.5 text-[var(--color-text-tertiary)]" />
          {BG_THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              title={th.label}
              onClick={() => updateSlide((s) => ({ ...s, bg: th.bg }))}
              className={cn(
                'size-5 rounded-full border transition-transform hover:scale-110',
                activeSlide.bg === th.bg ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30' : 'border-black/20',
              )}
              style={{ backgroundColor: th.bg }}
            />
          ))}
        </div>

        {/* Selected element properties */}
        {selectedEl && (
          <>
            <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />

            {selectedEl.kind === 'text' && (
              <>
                <select
                  value={selectedEl.fontSize}
                  onChange={(e) => updateElement(selectedEl.id, { fontSize: Number(e.target.value) })}
                  className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-xs"
                >
                  {[14, 18, 20, 24, 28, 32, 40, 48, 56].map((sz) => (
                    <option key={sz} value={sz}>
                      {sz} px
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => updateElement(selectedEl.id, { bold: !selectedEl.bold })}
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-md',
                    selectedEl.bold ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]',
                  )}
                >
                  <Bold className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => updateElement(selectedEl.id, { italic: !selectedEl.italic })}
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-md',
                    selectedEl.italic ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]',
                  )}
                >
                  <Italic className="size-3.5" />
                </button>
                {(['left', 'center', 'right'] as const).map((al) => {
                  const Icon = al === 'left' ? AlignLeft : al === 'center' ? AlignCenter : AlignRight
                  return (
                    <button
                      key={al}
                      type="button"
                      onClick={() => updateElement(selectedEl.id, { align: al })}
                      className={cn(
                        'inline-flex size-7 items-center justify-center rounded-md',
                        selectedEl.align === al
                          ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                          : 'text-[var(--color-text-secondary)]',
                      )}
                    >
                      <Icon className="size-3.5" />
                    </button>
                  )
                })}
                <div className="flex items-center gap-1 pl-1">
                  {ELEMENT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateElement(selectedEl.id, { color: c })}
                      className="size-4 rounded-full border border-black/20"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </>
            )}

            {selectedEl.kind === 'shape' && (
              <div className="flex items-center gap-1">
                {ELEMENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateElement(selectedEl.id, { fill: c, stroke: c })}
                    className="size-4 rounded-full border border-black/20"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => deleteElement(selectedEl.id)}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 className="size-3.5" />
              {t('tools.pdfEditor.props.delete')}
            </button>
          </>
        )}
      </div>

      {/* ── Main workspace: slide thumbnails + canvas ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left slide list */}
        <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              {t('tools.presentationEditor.slides')} ({slides.length})
            </span>
            <button
              type="button"
              onClick={() => {
                const theme = BG_THEMES.find((th) => th.bg === activeSlide.bg)
                const nextSlide = createContentSlide(
                  t('tools.presentationEditor.slideHeading'),
                  t('tools.presentationEditor.slideBody'),
                  activeSlide.bg,
                  theme?.text ?? '#0f172a',
                )
                setSlides((prev) => [...prev, nextSlide])
                setActiveIdx(slides.length)
                setSelectedElId(null)
              }}
              className="inline-flex size-6 items-center justify-center rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
              title={t('tools.presentationEditor.addSlide')}
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {slides.map((s, idx) => (
              <div key={s.id} className="group relative">
                <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)]">
                  <span>{idx + 1}</span>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        const copy: Slide = {
                          ...s,
                          id: uid(),
                          elements: s.elements.map((el) => ({ ...el, id: uid() })),
                        }
                        setSlides((prev) => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)])
                        setActiveIdx(idx + 1)
                      }}
                      title={t('tools.pdfEditor.props.duplicate')}
                    >
                      <Copy className="size-3" />
                    </button>
                    {slides.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSlides((prev) => prev.filter((_, i) => i !== idx))
                          setActiveIdx((cur) => Math.max(0, cur >= idx ? cur - 1 : cur))
                        }}
                        className="hover:text-red-500"
                        title={t('tools.pdfEditor.props.delete')}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveIdx(idx)
                    setSelectedElId(null)
                    setEditingElId(null)
                  }}
                  className={cn(
                    'block overflow-hidden rounded-md border-2 transition-colors',
                    idx === activeIdx
                      ? 'border-[var(--color-accent)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-text-tertiary)]',
                  )}
                >
                  <SlidePreview slide={s} scale={0.17} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Stage */}
        <div
          ref={stageWrapRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerDown={() => {
            setSelectedElId(null)
            setEditingElId(null)
          }}
          className="flex flex-1 items-center justify-center overflow-auto bg-[var(--color-surface-sunken)] p-6"
        >
          <div
            className="relative overflow-hidden rounded-sm shadow-[var(--shadow-xl)]"
            style={{
              width: `${SLIDE_W * canvasScale}px`,
              height: `${SLIDE_H * canvasScale}px`,
              backgroundColor: activeSlide.bg,
            }}
          >
            {activeSlide.elements.map((el) => {
              const isSel = selectedElId === el.id
              const isEd = editingElId === el.id
              return (
                <div
                  key={el.id}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setSelectedElId(el.id)
                    if (isEd) return
                    dragRef.current = {
                      mode: 'move',
                      elId: el.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      origX: el.x,
                      origY: el.y,
                      origW: el.w,
                      origH: el.h,
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (el.kind === 'text') setEditingElId(el.id)
                  }}
                  style={{
                    left: `${el.x * canvasScale}px`,
                    top: `${el.y * canvasScale}px`,
                    width: `${el.w * canvasScale}px`,
                    height: `${el.h * canvasScale}px`,
                  }}
                  className={cn(
                    'absolute',
                    !isEd && 'cursor-move',
                    isSel && 'ring-2 ring-[var(--color-accent)]',
                  )}
                >
                  {el.kind === 'shape' && (
                    <div
                      className="h-full w-full"
                      style={{
                        backgroundColor: el.fill,
                        border: `2px solid ${el.stroke}`,
                        borderRadius: el.shape === 'ellipse' ? '9999px' : `${8 * canvasScale}px`,
                      }}
                    />
                  )}
                  {el.kind === 'image' && (
                    <img
                      src={el.dataUrl}
                      alt=""
                      draggable={false}
                      className="h-full w-full select-none object-contain"
                    />
                  )}
                  {el.kind === 'text' &&
                    (isEd ? (
                      <textarea
                        autoFocus
                        value={el.text}
                        onChange={(e) => updateElement(el.id, { text: e.target.value })}
                        onBlur={() => setEditingElId(null)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="h-full w-full resize-none bg-transparent outline-none"
                        style={{
                          fontSize: `${el.fontSize * canvasScale}px`,
                          fontWeight: el.bold ? 700 : 400,
                          fontStyle: el.italic ? 'italic' : 'normal',
                          color: el.color,
                          textAlign: el.align,
                          lineHeight: 1.3,
                        }}
                      />
                    ) : (
                      <div
                        className="h-full w-full whitespace-pre-wrap"
                        style={{
                          fontSize: `${el.fontSize * canvasScale}px`,
                          fontWeight: el.bold ? 700 : 400,
                          fontStyle: el.italic ? 'italic' : 'normal',
                          color: el.color,
                          textAlign: el.align,
                          lineHeight: 1.3,
                        }}
                      >
                        {el.text}
                      </div>
                    ))}

                  {/* Bottom-right resize handle */}
                  {isSel && !isEd && (
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        dragRef.current = {
                          mode: 'resize',
                          elId: el.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: el.x,
                          origY: el.y,
                          origW: el.w,
                          origH: el.h,
                        }
                      }}
                      className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-xs border border-white bg-[var(--color-accent)]"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Fullscreen slideshow overlay ── */}
      {presenting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
          <div className="relative overflow-hidden rounded-sm shadow-2xl">
            <SlidePreview
              slide={activeSlide}
              scale={Math.min((window.innerWidth - 64) / SLIDE_W, (window.innerHeight - 96) / SLIDE_H)}
            />
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-full bg-zinc-900/80 px-4 py-1.5 text-xs text-white">
            <button
              type="button"
              disabled={activeIdx <= 0}
              onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
              className="disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span>
              {activeIdx + 1} / {slides.length}
            </span>
            <button
              type="button"
              disabled={activeIdx >= slides.length - 1}
              onClick={() => setActiveIdx((i) => Math.min(slides.length - 1, i + 1))}
              className="disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setPresenting(false)}
              className="ml-2 rounded-full p-1 hover:bg-white/10"
              title="Esc"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={handleInsertImage}
      />
    </div>
  )
}
