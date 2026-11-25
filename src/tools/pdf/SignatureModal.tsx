import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Eraser, PenTool, Trash2, Type, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'edavio:saved-signatures'

type Tab = 'draw' | 'type' | 'upload'

const PEN_COLORS = ['#0f172a', '#2563eb', '#dc2626'] as const
const SCRIPT_FONTS = [
  { label: 'Classic', css: 'italic 42px "Georgia", serif' },
  { label: 'Brush', css: 'italic 44px "Brush Script MT", "Segoe Script", cursive' },
  { label: 'Modern', css: '600 36px "Inter", sans-serif' },
] as const

function loadSavedSignatures(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveSignatureToStorage(dataUrl: string) {
  try {
    const list = loadSavedSignatures().filter((s) => s !== dataUrl)
    list.unshift(dataUrl)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 6)))
  } catch {
    // Ignore quota errors
  }
}

function trimTransparentCanvas(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  const img = ctx.getImageData(0, 0, width, height)
  const { data } = img

  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let found = false

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0
      if (alpha > 8) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (!found) return null

  const pad = 12
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width, maxX + pad)
  maxY = Math.min(height, maxY + pad)

  const out = document.createElement('canvas')
  out.width = maxX - minX
  out.height = maxY - minY
  out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

export function SignatureModal({
  open,
  onClose,
  onInsert,
}: {
  open: boolean
  onClose: () => void
  onInsert: (dataUrl: string, aspectRatio: number) => void
}) {
  if (!open) return null
  return <SignatureModalContent onClose={onClose} onInsert={onInsert} />
}

function SignatureModalContent({
  onClose,
  onInsert,
}: {
  onClose: () => void
  onInsert: (dataUrl: string, aspectRatio: number) => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('draw')
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0])
  const [hasDrawn, setHasDrawn] = useState(false)
  const [typedText, setTypedText] = useState('')
  const [fontIdx, setFontIdx] = useState(1)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [saved, setSaved] = useState<string[]>(() => loadSavedSignatures())

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPtRef = useRef<{ x: number; y: number } | null>(null)

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }, [])

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    isDrawingRef.current = true
    const pt = getCanvasPoint(e)
    lastPtRef.current = pt
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.fillStyle = penColor
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2)
    ctx.fill()
    setHasDrawn(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPtRef.current) return
    const pt = getCanvasPoint(e)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.strokeStyle = penColor
    ctx.lineWidth = 4.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    lastPtRef.current = pt
  }

  const onPointerUp = () => {
    isDrawingRef.current = false
    lastPtRef.current = null
  }

  const insertDataUrl = (dataUrl: string, persist = true) => {
    const img = new Image()
    img.onload = () => {
      if (persist) saveSignatureToStorage(dataUrl)
      const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 2.5
      onInsert(dataUrl, ratio)
      onClose()
    }
    img.src = dataUrl
  }

  const handleConfirm = () => {
    if (tab === 'draw') {
      if (!canvasRef.current) return
      const trimmed = trimTransparentCanvas(canvasRef.current)
      if (trimmed) insertDataUrl(trimmed, true)
    } else if (tab === 'type') {
      if (!typedText.trim()) return
      const canvas = document.createElement('canvas')
      canvas.width = 720
      canvas.height = 180
      const ctx = canvas.getContext('2d')!
      const scriptFont = SCRIPT_FONTS[fontIdx] ?? SCRIPT_FONTS[0]
      ctx.font = scriptFont.css
      ctx.fillStyle = penColor
      ctx.textBaseline = 'middle'
      ctx.fillText(typedText.trim(), 24, 90)
      const trimmed = trimTransparentCanvas(canvas)
      if (trimmed) insertDataUrl(trimmed, true)
    } else if (tab === 'upload' && uploadedUrl) {
      insertDataUrl(uploadedUrl, true)
    }
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setUploadedUrl(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const deleteSaved = (url: string) => {
    const next = saved.filter((s) => s !== url)
    setSaved(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Ignore
    }
  }

  const canSubmit =
    (tab === 'draw' && hasDrawn) ||
    (tab === 'type' && typedText.trim().length > 0) ||
    (tab === 'upload' && Boolean(uploadedUrl))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('tools.pdfEditor.signature.title')}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 rounded-xl bg-[var(--color-surface-sunken)] p-1">
          {(
            [
              { id: 'draw', icon: PenTool, label: t('tools.pdfEditor.signature.draw') },
              { id: 'type', icon: Type, label: t('tools.pdfEditor.signature.type') },
              { id: 'upload', icon: Upload, label: t('tools.pdfEditor.signature.upload') },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-medium transition-all',
                tab === item.id
                  ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Pen color */}
        {tab !== 'upload' && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {PEN_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setPenColor(col)}
                  className={cn(
                    'size-6 rounded-full border-2 transition-transform',
                    penColor === col
                      ? 'scale-110 border-[var(--color-accent)]'
                      : 'border-transparent',
                  )}
                  style={{ backgroundColor: col }}
                  aria-label={col}
                />
              ))}
            </div>
            {tab === 'draw' && (
              <Button variant="ghost" size="xs" onClick={clearCanvas}>
                <Eraser className="size-3.5" />
                {t('tools.pdfEditor.signature.clear')}
              </Button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="mt-3">
          {tab === 'draw' && (
            <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
              <canvas
                ref={canvasRef}
                width={640}
                height={240}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="block h-44 w-full touch-none cursor-crosshair"
              />
              {!hasDrawn && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
                  {t('tools.pdfEditor.signature.drawHint')}
                </div>
              )}
            </div>
          )}

          {tab === 'type' && (
            <div className="space-y-3">
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder={t('tools.pdfEditor.signature.typePlaceholder')}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                autoFocus
              />
              <div className="grid grid-cols-3 gap-2">
                {SCRIPT_FONTS.map((f, idx) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setFontIdx(idx)}
                    className={cn(
                      'flex h-16 items-center justify-center overflow-hidden rounded-xl border bg-white px-2 text-lg transition-all',
                      fontIdx === idx
                        ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20'
                        : 'border-[var(--color-border)]',
                    )}
                    style={{
                      color: penColor,
                      fontFamily:
                        idx === 0
                          ? 'Georgia, serif'
                          : idx === 1
                            ? '"Brush Script MT", "Segoe Script", cursive'
                            : 'Inter, sans-serif',
                      fontStyle: idx < 2 ? 'italic' : 'normal',
                      fontWeight: idx === 2 ? 600 : 400,
                    }}
                  >
                    <span className="truncate">{typedText.trim() || 'Edavio'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'upload' && (
            <label className="flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 hover:border-[var(--color-accent)]">
              {uploadedUrl ? (
                <img src={uploadedUrl} alt="" className="max-h-36 object-contain" />
              ) : (
                <>
                  <Upload className="size-6 text-[var(--color-text-tertiary)]" />
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {t('tools.pdfEditor.signature.uploadPrompt')}
                  </span>
                </>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={handleUpload} />
            </label>
          )}
        </div>

        {/* Saved signatures */}
        {saved.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-[var(--color-text-tertiary)]">
              {t('tools.pdfEditor.signature.saved')}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {saved.map((url, idx) => (
                <div
                  key={idx}
                  className="group relative flex h-12 w-24 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-white p-1.5 hover:border-[var(--color-accent)]"
                  onClick={() => insertDataUrl(url, false)}
                >
                  <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSaved(url)
                    }}
                    className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-red-500 text-white shadow group-hover:flex"
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('tools.pdfEditor.signature.cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!canSubmit}>
            <Check className="size-4" />
            {t('tools.pdfEditor.signature.insert')}
          </Button>
        </div>
      </div>
    </div>
  )
}
