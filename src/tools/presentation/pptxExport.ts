import PptxGenJS from 'pptxgenjs'
import type { Deck, GeomKind, Para, ShapeEl, SlideEl } from './model'

const PX = 96 // px per inch
const inch = (px: number) => px / PX
const hex = (c: string | null | undefined) => (c ? c.replace('#', '').toUpperCase() : undefined)

const SHAPE_MAP: Record<GeomKind, string> = {
  rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', rtTriangle: 'rtTriangle', diamond: 'diamond',
  pentagon: 'pentagon', hexagon: 'hexagon', octagon: 'octagon', star5: 'star5', star4: 'star4', plus: 'plus',
  rightArrow: 'rightArrow', leftArrow: 'leftArrow', upArrow: 'upArrow', downArrow: 'downArrow', chevron: 'chevron',
  homePlate: 'homePlate', trapezoid: 'trapezoid', parallelogram: 'parallelogram', heart: 'heart', line: 'line',
}

function textRuns(el: ShapeEl): PptxGenJS.TextProps[] {
  const out: PptxGenJS.TextProps[] = []
  const paras: Para[] = el.paras.length ? el.paras : [{ runs: [] }]
  paras.forEach((p, pi) => {
    const lastP = pi === paras.length - 1
    const popts: PptxGenJS.TextPropsOptions = {
      align: p.align,
      indentLevel: p.level,
      lineSpacingMultiple: p.lineSpacing ? p.lineSpacing / 1.2 : undefined,
      bullet: p.bullet === 'bullet' ? true : p.bullet === 'number' ? { type: 'number' } : undefined,
    }
    const runs = p.runs.length ? p.runs : [{ text: '' }]
    runs.forEach((r, ri) => {
      const lastR = ri === runs.length - 1
      const isBr = r.text === '\n'
      out.push({
        text: isBr ? '' : r.text,
        options: {
          ...(ri === 0 ? popts : { align: p.align }),
          bold: r.bold,
          italic: r.italic,
          underline: r.underline ? { style: 'sng' } : undefined,
          strike: r.strike ? 'sngStrike' : undefined,
          color: hex(r.color ?? el.base.color),
          fontSize: r.size ?? el.base.size,
          fontFace: r.font ?? el.base.font,
          highlight: hex(r.highlight),
          breakLine: isBr || (lastR && !lastP),
        },
      })
    })
  })
  return out
}

function addElement(slide: PptxGenJS.Slide, el: SlideEl, pres: PptxGenJS) {
  const pos = { x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h) }
  const common = { ...pos, rotate: el.rot || undefined, flipH: el.flipH, flipV: el.flipV }

  if (el.kind === 'image') {
    slide.addImage({ data: el.src, ...common, transparency: el.alpha != null ? Math.round((1 - el.alpha) * 100) : undefined })
    return
  }
  if (el.kind === 'table') {
    const rows = el.rows.map((row, ri) =>
      row.map((c) => ({
        text: c.text,
        options: {
          bold: c.bold ?? (el.header && ri === 0),
          color: hex(c.color ?? '#1f2937'),
          fill: c.fill ? { color: hex(c.fill)! } : undefined,
          align: c.align,
          fontSize: el.fontSize,
          fontFace: el.font,
          border: { type: 'solid' as const, pt: 1, color: hex(el.border)! },
          valign: 'middle' as const,
        },
      })),
    )
    slide.addTable(rows, { x: pos.x, y: pos.y, colW: el.colW.map(inch), rowH: inch(el.rowH) })
    return
  }

  const lineOpts = el.line
    ? { color: hex(el.line)!, width: el.lineW || 1, dashType: el.dash === 'dash' ? ('dash' as const) : el.dash === 'dot' ? ('sysDot' as const) : ('solid' as const), beginArrowType: el.arrowStart ? ('triangle' as const) : undefined, endArrowType: el.arrowEnd ? ('triangle' as const) : undefined }
    : undefined
  const hasText = el.paras.some((p) => p.runs.some((r) => r.text))
  const shadow = el.shadow ? { type: 'outer' as const, color: '000000', opacity: 0.35, blur: 6, offset: 3, angle: 45 } : undefined

  if (el.geom === 'line') {
    slide.addShape(pres.ShapeType.line, { ...common, line: lineOpts ?? { color: '000000', width: 1 } })
    return
  }
  const fill = el.fill ? { color: hex(el.fill)!, transparency: el.fillAlpha != null ? Math.round((1 - el.fillAlpha) * 100) : 0 } : undefined
  if (!hasText && !el.fill && !el.line) return
  const shapeType = (pres.ShapeType as unknown as Record<string, string>)[SHAPE_MAP[el.geom]] ?? pres.ShapeType.rect
  if (hasText) {
    slide.addText(textRuns(el), {
      ...common,
      shape: shapeType as PptxGenJS.ShapeType,
      fill,
      line: lineOpts,
      shadow,
      valign: el.valign,
      margin: [el.pad / 1.333, el.pad / 1.333, el.pad / 1.333, el.pad / 1.333],
      fit: 'none',
      paraSpaceAfter: 0,
    })
  } else {
    slide.addShape(shapeType as PptxGenJS.ShapeType, { ...common, fill: fill ?? { type: 'none' }, line: lineOpts ?? { type: 'none' }, shadow })
  }
}

export async function exportPptx(deck: Deck): Promise<Blob> {
  const pres = new PptxGenJS()
  pres.defineLayout({ name: 'EDAVIO', width: inch(deck.w), height: inch(deck.h) })
  pres.layout = 'EDAVIO'
  pres.title = deck.title
  for (const s of deck.slides) {
    const slide = pres.addSlide()
    if (s.bgImage) slide.background = { data: s.bgImage }
    else slide.background = { color: hex(s.bg)! }
    for (const el of s.elements) addElement(slide, el, pres)
  }
  const out = (await pres.write({ outputType: 'blob' })) as Blob
  return out
}
