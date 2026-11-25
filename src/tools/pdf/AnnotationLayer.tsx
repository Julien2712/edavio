import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PDFPageProxy } from 'pdfjs-dist'
import { Util } from 'pdfjs-dist'
import { Copy, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  Annotation,
  DetectedTextItem,
  EditorTool,
  FontFamily,
  LineAnnotation,
  PathAnnotation,
  Point,
  ShapeAnnotation,
  TextAnnotation,
  ToolStyleConfig,
} from './types'

type HandleCorner = 'nw' | 'ne' | 'sw' | 'se'
type LineEnd = 'start' | 'end'

type DragState =
  | { kind: 'create-path'; ann: PathAnnotation }
  | { kind: 'create-shape'; start: Point; ann: ShapeAnnotation }
  | { kind: 'create-line'; start: Point; ann: LineAnnotation }
  | { kind: 'move'; annId: string; startPt: Point; orig: Annotation }
  | {
      kind: 'resize-box'
      annId: string
      corner: HandleCorner
      startPt: Point
      orig: { x: number; y: number; width: number; height: number }
    }
  | { kind: 'resize-line'; annId: string; end: LineEnd }

function fontCss(family: FontFamily) {
  if (family === 'TimesRoman') return 'Georgia, "Times New Roman", serif'
  if (family === 'Courier') return '"JetBrains Mono", "Courier New", monospace'
  return 'Inter, system-ui, -apple-system, sans-serif'
}

function getBoxBounds(ann: Annotation): { x: number; y: number; width: number; height: number } {
  switch (ann.type) {
    case 'draw':
    case 'highlight': {
      const xs = ann.points.map((p) => p.x)
      const ys = ann.points.map((p) => p.y)
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const maxX = Math.max(...xs)
      const maxY = Math.max(...ys)
      return {
        x: minX - ann.strokeWidth / 2,
        y: minY - ann.strokeWidth / 2,
        width: Math.max(12, maxX - minX + ann.strokeWidth),
        height: Math.max(12, maxY - minY + ann.strokeWidth),
      }
    }
    case 'line':
    case 'arrow': {
      const minX = Math.min(ann.x1, ann.x2)
      const minY = Math.min(ann.y1, ann.y2)
      return {
        x: minX - 6,
        y: minY - 6,
        width: Math.max(12, Math.abs(ann.x2 - ann.x1) + 12),
        height: Math.max(12, Math.abs(ann.y2 - ann.y1) + 12),
      }
    }
    case 'text':
    case 'rect':
    case 'ellipse':
    case 'redact':
    case 'image':
    case 'sign':
      return { x: ann.x, y: ann.y, width: ann.width, height: ann.height }
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function rgbToHex(r: number, g: number, b: number) {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')
  )
}

function sampleColorsFromCanvas(
  canvas: HTMLCanvasElement | null,
  item: DetectedTextItem,
  scale: number,
): { color: string; backgroundColor: string; bold: boolean } {
  const fallback = { color: '#0f172a', backgroundColor: '#ffffff', bold: false }
  if (!canvas) return fallback
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return fallback

  const ratioX = canvas.width / (canvas.clientWidth || canvas.width)
  const ratioY = canvas.height / (canvas.clientHeight || canvas.height)

  const x0 = Math.max(0, Math.floor(item.x * scale * ratioX))
  const y0 = Math.max(0, Math.floor(item.y * scale * ratioY))
  const w = Math.max(4, Math.min(canvas.width - x0, Math.ceil(item.width * scale * ratioX)))
  const h = Math.max(4, Math.min(canvas.height - y0, Math.ceil(item.height * scale * ratioY)))

  try {
    // Sample background from a 2px strip right above/below the text box
    const padY = Math.max(2, Math.round(3 * ratioY))
    const bgY = Math.max(0, y0 - padY)
    const bgData = ctx.getImageData(x0, bgY, w, Math.min(padY, canvas.height - bgY)).data
    const bgRs: number[] = []
    const bgGs: number[] = []
    const bgBs: number[] = []
    for (let i = 0; i < bgData.length; i += 4) {
      bgRs.push(bgData[i] ?? 255)
      bgGs.push(bgData[i + 1] ?? 255)
      bgBs.push(bgData[i + 2] ?? 255)
    }
    const median = (arr: number[]) => {
      if (arr.length === 0) return 255
      const sorted = [...arr].sort((a, b) => a - b)
      return sorted[Math.floor(sorted.length / 2)] ?? 255
    }
    const bgR = median(bgRs)
    const bgG = median(bgGs)
    const bgB = median(bgBs)

    // Sample foreground text pixels inside the box
    const fgData = ctx.getImageData(x0, y0, w, h).data
    const contrasts: { dist: number; r: number; g: number; b: number }[] = []
    for (let i = 0; i < fgData.length; i += 4) {
      const r = fgData[i] ?? 0
      const g = fgData[i + 1] ?? 0
      const b = fgData[i + 2] ?? 0
      const dist = Math.hypot(r - bgR, g - bgG, b - bgB)
      if (dist > 45) {
        contrasts.push({ dist, r, g, b })
      }
    }

    if (contrasts.length === 0) {
      const lum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB
      return {
        color: lum < 140 ? '#ffffff' : '#0f172a',
        backgroundColor: rgbToHex(bgR, bgG, bgB),
        bold: false,
      }
    }

    contrasts.sort((a, b) => b.dist - a.dist)
    const topCount = Math.max(1, Math.floor(contrasts.length * 0.35))
    let sumR = 0
    let sumG = 0
    let sumB = 0
    for (let i = 0; i < topCount; i++) {
      const c = contrasts[i]!
      sumR += c.r
      sumG += c.g
      sumB += c.b
    }

    const totalPixels = Math.max(1, w * h)
    const inkRatio = contrasts.length / totalPixels

    return {
      color: rgbToHex(sumR / topCount, sumG / topCount, sumB / topCount),
      backgroundColor: rgbToHex(bgR, bgG, bgB),
      bold: inkRatio > 0.24 || item.fontSize >= 17,
    }
  } catch {
    return fallback
  }
}

export function AnnotationLayer({
  pageId,
  pdfjsPage,
  userRotation,
  vpWidth,
  vpHeight,
  scale,
  tool,
  styleConfig,
  annotations,
  selectedId,
  editingTextId,
  getPageCanvas,
  onSelect,
  onEditingTextIdChange,
  onAddAnnotation,
  onReplacePdfText,
  onUpdateAnnotation,
  onCommitHistory,
  onDeleteAnnotation,
  onDuplicateAnnotation,
  onToolUsed,
}: {
  pageId: string
  pdfjsPage: PDFPageProxy | null
  userRotation: 0 | 90 | 180 | 270
  vpWidth: number
  vpHeight: number
  scale: number
  tool: EditorTool
  styleConfig: ToolStyleConfig
  annotations: Annotation[]
  selectedId: string | null
  editingTextId: string | null
  getPageCanvas: () => HTMLCanvasElement | null
  onSelect: (id: string | null) => void
  onEditingTextIdChange: (id: string | null) => void
  onAddAnnotation: (ann: Annotation, recordHistory?: boolean) => void
  onReplacePdfText: (
    item: DetectedTextItem,
    style: { color: string; backgroundColor: string; bold: boolean },
  ) => void
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>, recordHistory?: boolean) => void
  onCommitHistory: () => void
  onDeleteAnnotation: (id: string) => void
  onDuplicateAnnotation: (id: string) => void
  onToolUsed: () => void
}) {
  const { t } = useTranslation()
  const layerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [detectedTextState, setDetectedTextState] = useState<{
    key: string
    items: DetectedTextItem[]
  }>({ key: '', items: [] })

  const detectedKey = `${pageId}:${userRotation}:${annotations.length}`

  // Load and group text runs by visual line when edit-text mode is active
  useEffect(() => {
    if (tool !== 'edit-text' || !pdfjsPage) return
    let cancelled = false
    const totalRot = (((pdfjsPage.rotate + userRotation) % 360 + 360) % 360) as 0 | 90 | 180 | 270
    const vp1 = pdfjsPage.getViewport({ scale: 1, rotation: totalRot })

    pdfjsPage
      .getTextContent()
      .then((tc) => {
        if (cancelled) return
        const rawItems: DetectedTextItem[] = []
        tc.items.forEach((raw, idx) => {
          if (!('str' in raw) || !raw.str.trim()) return
          const tx = Util.transform(vp1.transform, raw.transform)
          const fontSize = Math.max(8, Math.round(Math.hypot(tx[2], tx[3])))
          const w = Math.max(10, raw.width)
          const h = Math.max(fontSize * 1.2, raw.height || fontSize * 1.2)
          const x = tx[4]
          const y = tx[5] - fontSize * 0.88

          const styleObj = tc.styles?.[raw.fontName]
          const ffRaw = styleObj?.fontFamily ?? ''
          let fontFamily: FontFamily = 'Helvetica'
          if (/serif|times/i.test(ffRaw)) fontFamily = 'TimesRoman'
          else if (/mono|courier/i.test(ffRaw)) fontFamily = 'Courier'

          const pdfFontSize = Math.max(6, Math.hypot(raw.transform[2], raw.transform[3]))
          const pdfX = raw.transform[4]
          const pdfY = raw.transform[5]

          rawItems.push({
            id: `txt-${idx}`,
            text: raw.str,
            x,
            y,
            width: w,
            height: h,
            fontSize,
            fontFamily,
            pdfX,
            pdfMaxX: pdfX + raw.width,
            pdfY,
            pdfFontSize,
          })
        })

        // Sort top-to-bottom, left-to-right and merge fragments on the same visual line
        rawItems.sort((a, b) => {
          if (Math.abs(a.y - b.y) > Math.min(a.fontSize, b.fontSize) * 0.35) {
            return a.y - b.y
          }
          return a.x - b.x
        })

        const merged: DetectedTextItem[] = []
        for (const cur of rawItems) {
          const prev = merged[merged.length - 1]
          if (prev) {
            const sameLine = Math.abs(cur.y - prev.y) <= Math.max(4, prev.fontSize * 0.35)
            const sameSize = Math.abs(cur.fontSize - prev.fontSize) <= Math.max(2, prev.fontSize * 0.25)
            const gap = cur.x - (prev.x + prev.width)
            if (sameLine && sameSize && gap >= -prev.fontSize * 0.5 && gap <= prev.fontSize * 1.1) {
              const needsSpace =
                gap > prev.fontSize * 0.16 &&
                !prev.text.endsWith(' ') &&
                !cur.text.startsWith(' ')
              prev.text = prev.text + (needsSpace ? ' ' : '') + cur.text
              prev.width = Math.max(prev.width, cur.x + cur.width - prev.x)
              prev.height = Math.max(prev.height, cur.height)
              prev.pdfX = Math.min(prev.pdfX, cur.pdfX)
              prev.pdfMaxX = Math.max(prev.pdfMaxX, cur.pdfMaxX)
              continue
            }
          }
          merged.push({ ...cur })
        }

        setDetectedTextState({ key: detectedKey, items: merged })
      })
      .catch(() => {
        if (!cancelled) setDetectedTextState({ key: detectedKey, items: [] })
      })

    return () => {
      cancelled = true
    }
  }, [tool, pdfjsPage, userRotation, detectedKey])

  const detectedText =
    tool === 'edit-text' && detectedTextState.key === detectedKey ? detectedTextState.items : []

  const toUnscaledPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = layerRef.current!.getBoundingClientRect()
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      }
    },
    [scale],
  )

  const handleLayerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const pt = toUnscaledPoint(e.clientX, e.clientY)

    if (tool === 'select') {
      onSelect(null)
      onEditingTextIdChange(null)
      return
    }

    if (tool === 'edit-text') {
      return
    }

    if (tool === 'text') {
      const newText: TextAnnotation = {
        id: uid(),
        pageId,
        type: 'text',
        x: pt.x,
        y: pt.y,
        width: 200,
        height: Math.max(32, styleConfig.fontSize * 1.5 + 8),
        text: '',
        fontSize: styleConfig.fontSize,
        fontFamily: styleConfig.fontFamily,
        bold: styleConfig.bold,
        italic: styleConfig.italic,
        color: styleConfig.color === '#ffffff' ? '#0f172a' : styleConfig.color,
        backgroundColor: styleConfig.textBgColor,
      }
      onAddAnnotation(newText, true)
      onSelect(newText.id)
      onEditingTextIdChange(newText.id)
      onToolUsed()
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)

    if (tool === 'draw' || tool === 'highlight') {
      const isHighlight = tool === 'highlight'
      const ann: PathAnnotation = {
        id: uid(),
        pageId,
        type: tool,
        points: [pt],
        color: isHighlight ? styleConfig.highlightColor : styleConfig.color,
        strokeWidth: isHighlight ? Math.max(14, styleConfig.strokeWidth * 4) : styleConfig.strokeWidth,
        opacity: isHighlight ? 0.38 : 1,
      }
      setDrag({ kind: 'create-path', ann })
    } else if (tool === 'rect' || tool === 'ellipse' || tool === 'redact') {
      const isRedact = tool === 'redact'
      const ann: ShapeAnnotation = {
        id: uid(),
        pageId,
        type: tool,
        x: pt.x,
        y: pt.y,
        width: 1,
        height: 1,
        color: isRedact ? styleConfig.redactColor : styleConfig.color,
        fillColor: isRedact ? styleConfig.redactColor : styleConfig.fillColor,
        strokeWidth: isRedact ? 0 : styleConfig.strokeWidth,
        opacity: 1,
      }
      setDrag({ kind: 'create-shape', start: pt, ann })
    } else if (tool === 'line' || tool === 'arrow') {
      const ann: LineAnnotation = {
        id: uid(),
        pageId,
        type: tool,
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
        color: styleConfig.color,
        strokeWidth: styleConfig.strokeWidth,
      }
      setDrag({ kind: 'create-line', start: pt, ann })
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const pt = toUnscaledPoint(e.clientX, e.clientY)

    if (drag.kind === 'create-path') {
      setDrag({
        ...drag,
        ann: { ...drag.ann, points: [...drag.ann.points, pt] },
      })
    } else if (drag.kind === 'create-shape') {
      const x = Math.min(drag.start.x, pt.x)
      const y = Math.min(drag.start.y, pt.y)
      const width = Math.max(4, Math.abs(pt.x - drag.start.x))
      const height = Math.max(4, Math.abs(pt.y - drag.start.y))
      setDrag({ ...drag, ann: { ...drag.ann, x, y, width, height } })
    } else if (drag.kind === 'create-line') {
      setDrag({ ...drag, ann: { ...drag.ann, x2: pt.x, y2: pt.y } })
    } else if (drag.kind === 'move') {
      const dx = pt.x - drag.startPt.x
      const dy = pt.y - drag.startPt.y
      const orig = drag.orig
      switch (orig.type) {
        case 'draw':
        case 'highlight':
          onUpdateAnnotation(
            drag.annId,
            { points: orig.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) },
            false,
          )
          break
        case 'line':
        case 'arrow':
          onUpdateAnnotation(
            drag.annId,
            { x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy },
            false,
          )
          break
        case 'text':
        case 'rect':
        case 'ellipse':
        case 'redact':
        case 'image':
        case 'sign':
          onUpdateAnnotation(drag.annId, { x: orig.x + dx, y: orig.y + dy }, false)
          break
      }
    } else if (drag.kind === 'resize-box') {
      const dx = pt.x - drag.startPt.x
      const dy = pt.y - drag.startPt.y
      const { x, y, width, height } = drag.orig
      let nx = x
      let ny = y
      let nw = width
      let nh = height

      if (drag.corner.includes('e')) nw = Math.max(16, width + dx)
      if (drag.corner.includes('s')) nh = Math.max(16, height + dy)
      if (drag.corner.includes('w')) {
        const nextW = Math.max(16, width - dx)
        nx = x + (width - nextW)
        nw = nextW
      }
      if (drag.corner.includes('n')) {
        const nextH = Math.max(16, height - dy)
        ny = y + (height - nextH)
        nh = nextH
      }
      onUpdateAnnotation(drag.annId, { x: nx, y: ny, width: nw, height: nh }, false)
    } else if (drag.kind === 'resize-line') {
      if (drag.end === 'start') {
        onUpdateAnnotation(drag.annId, { x1: pt.x, y1: pt.y }, false)
      } else {
        onUpdateAnnotation(drag.annId, { x2: pt.x, y2: pt.y }, false)
      }
    }
  }

  const handlePointerUp = () => {
    if (!drag) return
    if (drag.kind === 'create-path') {
      if (drag.ann.points.length >= 2) {
        onAddAnnotation(drag.ann, true)
        onSelect(drag.ann.id)
      }
    } else if (drag.kind === 'create-shape') {
      if (drag.ann.width >= 6 && drag.ann.height >= 6) {
        onAddAnnotation(drag.ann, true)
        onSelect(drag.ann.id)
        if (drag.ann.type !== 'redact') onToolUsed()
      }
    } else if (drag.kind === 'create-line') {
      const dist = Math.hypot(drag.ann.x2 - drag.ann.x1, drag.ann.y2 - drag.ann.y1)
      if (dist >= 6) {
        onAddAnnotation(drag.ann, true)
        onSelect(drag.ann.id)
        onToolUsed()
      }
    } else if (drag.kind === 'move' || drag.kind === 'resize-box' || drag.kind === 'resize-line') {
      onCommitHistory()
    }
    setDrag(null)
  }

  const startMove = (e: React.PointerEvent, ann: Annotation) => {
    if (tool !== 'select') return
    if (editingTextId === ann.id) return
    e.stopPropagation()
    onSelect(ann.id)
    const pt = toUnscaledPoint(e.clientX, e.clientY)
    layerRef.current?.setPointerCapture(e.pointerId)
    setDrag({ kind: 'move', annId: ann.id, startPt: pt, orig: ann })
  }

  const startResizeBox = (
    e: React.PointerEvent,
    ann: { id: string; x: number; y: number; width: number; height: number },
    corner: HandleCorner,
  ) => {
    e.stopPropagation()
    const pt = toUnscaledPoint(e.clientX, e.clientY)
    layerRef.current?.setPointerCapture(e.pointerId)
    setDrag({
      kind: 'resize-box',
      annId: ann.id,
      corner,
      startPt: pt,
      orig: { x: ann.x, y: ann.y, width: ann.width, height: ann.height },
    })
  }

  const startResizeLine = (e: React.PointerEvent, ann: LineAnnotation, end: LineEnd) => {
    e.stopPropagation()
    layerRef.current?.setPointerCapture(e.pointerId)
    setDrag({ kind: 'resize-line', annId: ann.id, end })
  }

  const handleDetectedTextClick = (item: DetectedTextItem) => {
    const sampled = sampleColorsFromCanvas(getPageCanvas(), item, scale)
    onReplacePdfText(item, sampled)
    onToolUsed()
  }

  const previewAnn =
    drag && (drag.kind === 'create-path' || drag.kind === 'create-shape' || drag.kind === 'create-line')
      ? drag.ann
      : null

  const allItems = previewAnn ? [...annotations, previewAnn] : annotations

  const cursorClass =
    tool === 'select'
      ? 'cursor-default'
      : tool === 'text' || tool === 'edit-text'
        ? 'cursor-text'
        : 'cursor-crosshair'

  const selectedAnn = annotations.find((a) => a.id === selectedId) ?? null
  const selectedBounds = selectedAnn ? getBoxBounds(selectedAnn) : null

  return (
    <div
      ref={layerRef}
      onPointerDown={handleLayerPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn('absolute inset-0 z-20 touch-none select-none', cursorClass)}
      style={{ width: `${vpWidth}px`, height: `${vpHeight}px` }}
    >
      {/* Detected existing text targets in edit-text mode */}
      {tool === 'edit-text' &&
        detectedText.map((item) => (
          <button
            key={item.id}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => handleDetectedTextClick(item)}
            className="cursor-text absolute rounded-xs border border-transparent hover:border-blue-500 hover:bg-blue-500/15 transition-colors"
            style={{
              left: `${item.x * scale}px`,
              top: `${item.y * scale}px`,
              width: `${item.width * scale}px`,
              height: `${item.height * scale}px`,
            }}
            title={item.text}
          />
        ))}

      {/* SVG layer for paths, shapes, lines, arrows */}
      <svg
        width={vpWidth}
        height={vpHeight}
        viewBox={`0 0 ${vpWidth / scale} ${vpHeight / scale}`}
        className="pointer-events-none absolute inset-0"
      >
        <defs>
          {allItems
            .filter((a): a is LineAnnotation => a.type === 'arrow')
            .map((a) => (
              <marker
                key={`mk-${a.id}`}
                id={`arrow-${a.id}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill={a.color} />
              </marker>
            ))}
        </defs>

        {allItems.map((ann) => {
          if (ann.type === 'draw' || ann.type === 'highlight') {
            if (ann.points.length < 2) return null
            const d = ann.points
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
              .join(' ')
            return (
              <path
                key={ann.id}
                d={d}
                fill="none"
                stroke={ann.color}
                strokeWidth={ann.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={ann.opacity}
                style={{
                  pointerEvents: tool === 'select' ? 'stroke' : 'none',
                  cursor: tool === 'select' ? 'var(--cursor-move)' : undefined,
                  mixBlendMode: ann.type === 'highlight' ? 'multiply' : 'normal',
                }}
                onPointerDown={(e) => startMove(e, ann)}
              />
            )
          }

          if (ann.type === 'rect' || ann.type === 'redact') {
            return (
              <rect
                key={ann.id}
                x={ann.x}
                y={ann.y}
                width={ann.width}
                height={ann.height}
                fill={ann.fillColor ?? 'transparent'}
                stroke={ann.strokeWidth > 0 ? ann.color : 'none'}
                strokeWidth={ann.strokeWidth}
                opacity={ann.opacity}
                style={{
                  pointerEvents: tool === 'select' ? 'all' : 'none',
                  cursor: tool === 'select' ? 'var(--cursor-move)' : undefined,
                }}
                onPointerDown={(e) => startMove(e, ann)}
              />
            )
          }

          if (ann.type === 'ellipse') {
            return (
              <ellipse
                key={ann.id}
                cx={ann.x + ann.width / 2}
                cy={ann.y + ann.height / 2}
                rx={ann.width / 2}
                ry={ann.height / 2}
                fill={ann.fillColor ?? 'transparent'}
                stroke={ann.strokeWidth > 0 ? ann.color : 'none'}
                strokeWidth={ann.strokeWidth}
                opacity={ann.opacity}
                style={{
                  pointerEvents: tool === 'select' ? 'all' : 'none',
                  cursor: tool === 'select' ? 'var(--cursor-move)' : undefined,
                }}
                onPointerDown={(e) => startMove(e, ann)}
              />
            )
          }

          if (ann.type === 'line' || ann.type === 'arrow') {
            return (
              <g key={ann.id}>
                <line
                  x1={ann.x1}
                  y1={ann.y1}
                  x2={ann.x2}
                  y2={ann.y2}
                  stroke={ann.color}
                  strokeWidth={ann.strokeWidth}
                  strokeLinecap="round"
                  markerEnd={ann.type === 'arrow' ? `url(#arrow-${ann.id})` : undefined}
                />
                {tool === 'select' && (
                  <line
                    x1={ann.x1}
                    y1={ann.y1}
                    x2={ann.x2}
                    y2={ann.y2}
                    stroke="transparent"
                    strokeWidth={Math.max(14, ann.strokeWidth + 10)}
                    style={{ pointerEvents: 'stroke', cursor: 'var(--cursor-move)' }}
                    onPointerDown={(e) => startMove(e, ann)}
                  />
                )}
              </g>
            )
          }

          return null
        })}
      </svg>

      {/* HTML layer for text boxes, images, signatures */}
      {allItems.map((ann) => {
        if (ann.type === 'image' || ann.type === 'sign') {
          return (
            <div
              key={ann.id}
              onPointerDown={(e) => startMove(e, ann)}
              className={cn('absolute', tool === 'select' ? 'cursor-move' : 'pointer-events-none')}
              style={{
                left: `${ann.x * scale}px`,
                top: `${ann.y * scale}px`,
                width: `${ann.width * scale}px`,
                height: `${ann.height * scale}px`,
              }}
            >
              <img
                src={ann.dataUrl}
                alt=""
                draggable={false}
                className="h-full w-full select-none object-fill"
              />
            </div>
          )
        }

        if (ann.type === 'text') {
          const isEditing = editingTextId === ann.id
          const pad = ann.compact ? 0 : 4
          const lh = ann.compact ? 1.15 : 1.25
          return (
            <div
              key={ann.id}
              onPointerDown={(e) => {
                if (isEditing) {
                  e.stopPropagation()
                  return
                }
                startMove(e, ann)
              }}
              onDoubleClick={(e) => {
                if (tool !== 'select') return
                e.stopPropagation()
                onSelect(ann.id)
                onEditingTextIdChange(ann.id)
              }}
              className={cn(
                'absolute rounded-xs',
                tool === 'select' && !isEditing ? 'cursor-move' : '',
                tool !== 'select' && !isEditing ? 'pointer-events-none' : '',
                isEditing && 'outline-2 outline-dashed outline-[var(--color-accent)]',
              )}
              style={{
                left: `${ann.x * scale}px`,
                top: `${ann.y * scale}px`,
                width: `${ann.width * scale}px`,
                minHeight: `${ann.height * scale}px`,
                backgroundColor: ann.backgroundColor ?? 'transparent',
                padding: `${pad * scale}px`,
              }}
            >
              {isEditing ? (
                <textarea
                  autoFocus
                  value={ann.text}
                  placeholder={t('tools.pdfEditor.props.textPlaceholder')}
                  onChange={(e) => {
                    const el = e.target
                    onUpdateAnnotation(
                      ann.id,
                      {
                        text: el.value,
                        height: Math.max(ann.height, el.scrollHeight / scale),
                      },
                      false,
                    )
                  }}
                  onBlur={() => {
                    onEditingTextIdChange(null)
                    onCommitHistory()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      onEditingTextIdChange(null)
                      onCommitHistory()
                    }
                  }}
                  className="cursor-text h-full min-h-full w-full resize-none bg-transparent outline-none"
                  style={{
                    fontFamily: fontCss(ann.fontFamily),
                    fontSize: `${ann.fontSize * scale}px`,
                    lineHeight: lh,
                    fontWeight: ann.bold ? 700 : 400,
                    fontStyle: ann.italic ? 'italic' : 'normal',
                    color: ann.color,
                  }}
                />
              ) : (
                <div
                  className="whitespace-pre-wrap break-words"
                  style={{
                    fontFamily: fontCss(ann.fontFamily),
                    fontSize: `${ann.fontSize * scale}px`,
                    lineHeight: lh,
                    fontWeight: ann.bold ? 700 : 400,
                    fontStyle: ann.italic ? 'italic' : 'normal',
                    color: ann.color,
                  }}
                >
                  {ann.text || (
                    <span className="italic opacity-40">
                      {t('tools.pdfEditor.props.textPlaceholder')}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        }

        return null
      })}

      {/* Selection bounding box & handles */}
      {selectedAnn && selectedBounds && tool === 'select' && editingTextId !== selectedAnn.id && (
        <>
          <div
            className="pointer-events-none absolute border-2 border-[var(--color-accent)]"
            style={{
              left: `${selectedBounds.x * scale}px`,
              top: `${selectedBounds.y * scale}px`,
              width: `${selectedBounds.width * scale}px`,
              height: `${selectedBounds.height * scale}px`,
            }}
          />

          {/* Quick action pill above selection */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute z-30 flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
            style={{
              left: `${Math.max(4, selectedBounds.x * scale)}px`,
              top: `${Math.max(4, selectedBounds.y * scale - 38)}px`,
            }}
          >
            <button
              type="button"
              onClick={() => onDuplicateAnnotation(selectedAnn.id)}
              title={t('tools.pdfEditor.props.duplicate')}
              className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]"
            >
              <Copy className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteAnnotation(selectedAnn.id)}
              title={t('tools.pdfEditor.props.delete')}
              className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          {/* Box resize handles */}
          {(selectedAnn.type === 'rect' ||
            selectedAnn.type === 'ellipse' ||
            selectedAnn.type === 'redact' ||
            selectedAnn.type === 'text' ||
            selectedAnn.type === 'image' ||
            selectedAnn.type === 'sign') &&
            (
              [
                { corner: 'nw', x: selectedAnn.x, y: selectedAnn.y, cursor: 'nwse-resize' },
                {
                  corner: 'ne',
                  x: selectedAnn.x + selectedAnn.width,
                  y: selectedAnn.y,
                  cursor: 'nesw-resize',
                },
                {
                  corner: 'sw',
                  x: selectedAnn.x,
                  y: selectedAnn.y + selectedAnn.height,
                  cursor: 'nesw-resize',
                },
                {
                  corner: 'se',
                  x: selectedAnn.x + selectedAnn.width,
                  y: selectedAnn.y + selectedAnn.height,
                  cursor: 'nwse-resize',
                },
              ] as const
            ).map((h) => (
              <div
                key={h.corner}
                onPointerDown={(e) => startResizeBox(e, selectedAnn, h.corner)}
                className="absolute z-30 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-accent)] bg-white shadow"
                style={{
                  left: `${h.x * scale}px`,
                  top: `${h.y * scale}px`,
                  cursor: h.cursor,
                }}
              />
            ))}

          {/* Line / Arrow endpoint handles */}
          {(selectedAnn.type === 'line' || selectedAnn.type === 'arrow') &&
            (
              [
                { end: 'start', x: selectedAnn.x1, y: selectedAnn.y1 },
                { end: 'end', x: selectedAnn.x2, y: selectedAnn.y2 },
              ] as const
            ).map((h) => (
              <div
                key={h.end}
                onPointerDown={(e) => startResizeLine(e, selectedAnn, h.end)}
                className="absolute z-30 size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-[var(--color-accent)] bg-white shadow"
                style={{
                  left: `${h.x * scale}px`,
                  top: `${h.y * scale}px`,
                }}
              />
            ))}
        </>
      )}
    </div>
  )
}
