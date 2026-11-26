import {
  beginText,
  degrees,
  degreesToRadians,
  endText,
  LineCapStyle,
  LineJoinStyle,
  closePath,
  endPath,
  fill,
  fillAndStroke,
  lineTo,
  moveTo,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  BlendMode,
  rgb,
  rotateAndSkewTextRadiansAndTranslate,
  setCharacterSpacing,
  setFillingColor,
  setFontAndSize,
  showText,
  StandardFonts,
  type Color,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { polygonPoints } from './shapeGeometry'
import { baselineFromTop, lineHeightFactor, textPadding } from './fontInfo'
import type { Annotation, FontFamily, PageEntry, Point } from './types'

/** Draws one line of text; uses raw PDF operators when extra character spacing is needed. */
function drawTextLine(
  page: PDFPage,
  font: PDFFont,
  line: string,
  o: { x: number; y: number; size: number; color: Color; rotation: number; charSpacing: number },
) {
  if (!o.charSpacing) {
    page.drawText(line, {
      x: o.x,
      y: o.y,
      size: o.size,
      font,
      color: o.color,
      rotate: degrees(o.rotation),
    })
    return
  }
  const fontKey = page.node.newFontDictionary(font.name, font.ref)
  page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFillingColor(o.color),
    setFontAndSize(fontKey, o.size),
    setCharacterSpacing(o.charSpacing),
    rotateAndSkewTextRadiansAndTranslate(degreesToRadians(o.rotation), 0, 0, o.x, o.y),
    showText(font.encodeText(line)),
    endText(),
    popGraphicsState(),
  )
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return rgb(0, 0, 0)
  const r = ((num >> 16) & 255) / 255
  const g = ((num >> 8) & 255) / 255
  const b = (num & 255) / 255
  return rgb(r, g, b)
}

function getStandardFontKey(family: FontFamily, bold: boolean, italic: boolean): StandardFonts {
  if (family === 'TimesRoman') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic
    if (bold) return StandardFonts.TimesRomanBold
    if (italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }
  if (family === 'Courier') {
    if (bold && italic) return StandardFonts.CourierBoldOblique
    if (bold) return StandardFonts.CourierBold
    if (italic) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique
  if (bold) return StandardFonts.HelveticaBold
  if (italic) return StandardFonts.HelveticaOblique
  return StandardFonts.Helvetica
}

/** Replace characters not supported by WinAnsi encoding so pdf-lib never throws */
function sanitizeWinAnsi(text: string, font: PDFFont): string {
  let out = ''
  for (const ch of text) {
    if (ch === '\n' || ch === '\r' || ch === '\t') {
      out += ch === '\t' ? '  ' : ch
      continue
    }
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += '?'
    }
  }
  return out
}

function wrapTextLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const safe = sanitizeWinAnsi(text, font)
  const paragraphs = safe.split(/\r?\n/)
  const lines: string[] = []
  const usableWidth = Math.max(20, maxWidth)

  for (const para of paragraphs) {
    if (para === '') {
      lines.push('')
      continue
    }
    const words = para.split(' ')
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, fontSize) <= usableWidth) {
        current = candidate
      } else {
        if (current) lines.push(current)
        // If single word exceeds width, break by character
        if (font.widthOfTextAtSize(word, fontSize) > usableWidth) {
          let chunk = ''
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) <= usableWidth) {
              chunk += ch
            } else {
              if (chunk) lines.push(chunk)
              chunk = ch
            }
          }
          current = chunk
        } else {
          current = word
        }
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

async function dataUrlToPngOrJpgBytes(
  dataUrl: string,
): Promise<{ kind: 'png' | 'jpg'; bytes: Uint8Array }> {
  const isJpg = /^data:image\/jpe?g/i.test(dataUrl)
  const isPng = /^data:image\/png/i.test(dataUrl)

  if (isJpg || isPng) {
    const res = await fetch(dataUrl)
    const buf = await res.arrayBuffer()
    return { kind: isJpg ? 'jpg' : 'png', bytes: new Uint8Array(buf) }
  }

  // Convert WebP / SVG / GIF to PNG via an offscreen canvas
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Failed to load image for PDF export'))
    el.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || 300
  canvas.height = img.naturalHeight || 150
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const pngUrl = canvas.toDataURL('image/png')
  const res = await fetch(pngUrl)
  const buf = await res.arrayBuffer()
  return { kind: 'png', bytes: new Uint8Array(buf) }
}

function blankVpToPdf(
  vx: number,
  vy: number,
  baseW: number,
  baseH: number,
  rot: 0 | 90 | 180 | 270,
): [number, number] {
  switch (rot) {
    case 0:
      return [vx, baseH - vy]
    case 90:
      return [vy, vx]
    case 180:
      return [baseW - vx, vy]
    case 270:
      return [baseW - vy, baseH - vx]
  }
}

export async function exportAnnotatedPdf(params: {
  rawBytes: Uint8Array
  pdfjsDoc: PDFDocumentProxy
  pages: PageEntry[]
  annotations: Annotation[]
}): Promise<Uint8Array> {
  const { rawBytes, pdfjsDoc, pages, annotations } = params
  const srcDoc = await PDFDocument.load(rawBytes)
  const outDoc = await PDFDocument.create()

  const fontCache = new Map<StandardFonts, PDFFont>()
  const getFont = async (key: StandardFonts) => {
    let f = fontCache.get(key)
    if (!f) {
      f = await outDoc.embedFont(key)
      fontCache.set(key, f)
    }
    return f
  }

  const imageCache = new Map<string, PDFImage>()
  const getImage = async (dataUrl: string) => {
    let img = imageCache.get(dataUrl)
    if (!img) {
      const { kind, bytes } = await dataUrlToPngOrJpgBytes(dataUrl)
      img = kind === 'jpg' ? await outDoc.embedJpg(bytes) : await outDoc.embedPng(bytes)
      imageCache.set(dataUrl, img)
    }
    return img
  }

  for (const entry of pages) {
    let outPage
    let totalRotation: 0 | 90 | 180 | 270 = entry.userRotation
    let vpToPdf: (vx: number, vy: number) => [number, number]

    if (entry.originalIndex !== null) {
      const [copied] = await outDoc.copyPages(srcDoc, [entry.originalIndex])
      outPage = outDoc.addPage(copied)
      const pdfjsPage = await pdfjsDoc.getPage(entry.originalIndex + 1)
      totalRotation = (((pdfjsPage.rotate + entry.userRotation) % 360 + 360) % 360) as
        | 0
        | 90
        | 180
        | 270
      outPage.setRotation(degrees(totalRotation))
      const vp = pdfjsPage.getViewport({ scale: 1, rotation: totalRotation })
      vpToPdf = (vx: number, vy: number) => {
        const pt = vp.convertToPdfPoint(vx, vy)
        return [pt[0], pt[1]]
      }
    } else {
      outPage = outDoc.addPage([entry.baseWidth, entry.baseHeight])
      outPage.setRotation(degrees(totalRotation))
      vpToPdf = (vx: number, vy: number) =>
        blankVpToPdf(vx, vy, entry.baseWidth, entry.baseHeight, totalRotation)
    }

    const pageAnns = annotations.filter((a) => a.pageId === entry.id)

    for (const ann of pageAnns) {
      if (ann.type === 'rect' || ann.type === 'redact') {
        const corners = [
          vpToPdf(ann.x, ann.y),
          vpToPdf(ann.x + ann.width, ann.y),
          vpToPdf(ann.x + ann.width, ann.y + ann.height),
          vpToPdf(ann.x, ann.y + ann.height),
        ]
        const xs = corners.map((c) => c[0])
        const ys = corners.map((c) => c[1])
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        const maxX = Math.max(...xs)
        const maxY = Math.max(...ys)

        outPage.drawRectangle({
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          color: ann.fillColor ? hexToRgb(ann.fillColor) : undefined,
          borderColor: ann.strokeWidth > 0 ? hexToRgb(ann.color) : undefined,
          borderWidth: ann.strokeWidth,
          opacity: ann.opacity,
          borderOpacity: ann.opacity,
          blendMode: ann.underlay ? BlendMode.Multiply : undefined,
        })
      } else if (ann.type === 'polygon') {
        const pts = polygonPoints(ann.polygon ?? 'triangle', ann.x, ann.y, ann.width, ann.height).map(
          ([px, py]) => vpToPdf(px, py),
        )
        const ops = [pushGraphicsState()]
        const hasFill = !!ann.fillColor
        const hasStroke = ann.strokeWidth > 0
        if (hasFill) ops.push(setFillingColor(hexToRgb(ann.fillColor!)))
        if (hasStroke) {
          ops.push(setStrokingColor(hexToRgb(ann.color)), setLineWidth(ann.strokeWidth), setLineJoin(LineJoinStyle.Round))
        }
        pts.forEach(([px, py], i) => ops.push(i === 0 ? moveTo(px, py) : lineTo(px, py)))
        ops.push(closePath())
        if (hasFill && hasStroke) ops.push(fillAndStroke())
        else if (hasFill) ops.push(fill())
        else if (hasStroke) ops.push(stroke())
        else ops.push(endPath())
        ops.push(popGraphicsState())
        outPage.pushOperators(...ops)
      } else if (ann.type === 'ellipse') {
        const [cx, cy] = vpToPdf(ann.x + ann.width / 2, ann.y + ann.height / 2)
        const swapped = totalRotation === 90 || totalRotation === 270
        const xScale = (swapped ? ann.height : ann.width) / 2
        const yScale = (swapped ? ann.width : ann.height) / 2
        outPage.drawEllipse({
          x: cx,
          y: cy,
          xScale,
          yScale,
          color: ann.fillColor ? hexToRgb(ann.fillColor) : undefined,
          borderColor: ann.strokeWidth > 0 ? hexToRgb(ann.color) : undefined,
          borderWidth: ann.strokeWidth,
          opacity: ann.opacity,
          borderOpacity: ann.opacity,
        })
      } else if (ann.type === 'line' || ann.type === 'arrow') {
        const [sx, sy] = vpToPdf(ann.x1, ann.y1)
        const [ex, ey] = vpToPdf(ann.x2, ann.y2)
        const col = hexToRgb(ann.color)
        outPage.drawLine({
          start: { x: sx, y: sy },
          end: { x: ex, y: ey },
          thickness: ann.strokeWidth,
          color: col,
          lineCap: LineCapStyle.Round,
        })

        if (ann.type === 'arrow') {
          const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1)
          const headLen = Math.max(10, ann.strokeWidth * 4)
          const p1: Point = {
            x: ann.x2 - headLen * Math.cos(angle - Math.PI / 6),
            y: ann.y2 - headLen * Math.sin(angle - Math.PI / 6),
          }
          const p2: Point = {
            x: ann.x2 - headLen * Math.cos(angle + Math.PI / 6),
            y: ann.y2 - headLen * Math.sin(angle + Math.PI / 6),
          }
          const [ax1, ay1] = vpToPdf(p1.x, p1.y)
          const [ax2, ay2] = vpToPdf(p2.x, p2.y)
          outPage.drawLine({
            start: { x: ex, y: ey },
            end: { x: ax1, y: ay1 },
            thickness: ann.strokeWidth,
            color: col,
            lineCap: LineCapStyle.Round,
          })
          outPage.drawLine({
            start: { x: ex, y: ey },
            end: { x: ax2, y: ay2 },
            thickness: ann.strokeWidth,
            color: col,
            lineCap: LineCapStyle.Round,
          })
        }
      } else if (ann.type === 'draw' || ann.type === 'highlight') {
        if (ann.points.length < 2) continue
        const col = hexToRgb(ann.color)
        for (let i = 1; i < ann.points.length; i++) {
          const prevPt = ann.points[i - 1]
          const curPt = ann.points[i]
          if (!prevPt || !curPt) continue
          const [sx, sy] = vpToPdf(prevPt.x, prevPt.y)
          const [ex, ey] = vpToPdf(curPt.x, curPt.y)
          outPage.drawLine({
            start: { x: sx, y: sy },
            end: { x: ex, y: ey },
            thickness: ann.strokeWidth,
            color: col,
            opacity: ann.opacity,
            lineCap: LineCapStyle.Round,
          })
        }
      } else if (ann.type === 'image' || ann.type === 'sign') {
        const img = await getImage(ann.dataUrl)
        const [px, py] = vpToPdf(ann.x, ann.y + ann.height)
        outPage.drawImage(img, {
          x: px,
          y: py,
          width: ann.width,
          height: ann.height,
          rotate: degrees(totalRotation),
        })
      } else if (ann.type === 'text') {
        if (ann.backgroundColor) {
          const corners = [
            vpToPdf(ann.x, ann.y),
            vpToPdf(ann.x + ann.width, ann.y),
            vpToPdf(ann.x + ann.width, ann.y + ann.height),
            vpToPdf(ann.x, ann.y + ann.height),
          ]
          const xs = corners.map((c) => c[0])
          const ys = corners.map((c) => c[1])
          const minX = Math.min(...xs)
          const minY = Math.min(...ys)
          outPage.drawRectangle({
            x: minX,
            y: minY,
            width: Math.max(...xs) - minX,
            height: Math.max(...ys) - minY,
            color: hexToRgb(ann.backgroundColor),
          })
        }
        if (!ann.text.trim()) continue
        const pad = textPadding(ann.compact)
        const fontKey = getStandardFontKey(ann.fontFamily, ann.bold, ann.italic)
        const font = await getFont(fontKey)
        // Text taken from a PDF line never wraps; typed text wraps inside its box
        const lines = ann.compact
          ? ann.text.split(/\r?\n/)
          : wrapTextLines(ann.text, font, ann.fontSize, ann.width - pad * 2)
        const lineHeight = ann.fontSize * lineHeightFactor(ann.compact)
        // Same baseline as the on-screen box, computed from the real font metrics
        const firstBaseline = baselineFromTop(ann.fontFamily, ann.fontSize, ann.compact)
        const col = hexToRgb(ann.color)

        lines.forEach((line, idx) => {
          if (!line) return
          const vx = ann.x + pad
          const vy = ann.y + firstBaseline + idx * lineHeight
          const [px, py] = vpToPdf(vx, vy)
          drawTextLine(outPage, font, line, {
            x: px,
            y: py,
            size: ann.fontSize,
            color: col,
            rotation: totalRotation,
            charSpacing: ann.letterSpacing ?? 0,
          })
        })
      }
    }

    if (entry.mirrored) {
      // Flip the whole page (original content + annotations) left/right as displayed
      const box = outPage.getCropBox()
      const horizontalIsX = totalRotation === 0 || totalRotation === 180
      const m = horizontalIsX
        ? [-1, 0, 0, 1, 2 * box.x + box.width, 0]
        : [1, 0, 0, -1, 0, 2 * box.y + box.height]
      const start = outDoc.context.register(
        outDoc.context.stream(`q ${m.join(' ')} cm\n`),
      )
      const end = outDoc.context.register(outDoc.context.stream('\nQ'))
      outPage.node.wrapContentStreams(start, end)
    }
  }

  return await outDoc.save()
}
