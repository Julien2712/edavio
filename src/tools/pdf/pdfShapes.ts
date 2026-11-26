import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  type PDFPage,
} from 'pdf-lib'
import {
  decodeStreamLatin1,
  encodeLatin1,
  IDENTITY,
  mulMat,
  tokenizeContentStream,
  type Matrix,
  type Token,
} from './pdfTextRemover'
import type { PdfBox, PdfShape, ShapeSuppression } from './types'

/**
 * Detects the vector shapes (rectangles, lines, paths) drawn in a PDF page and can
 * remove them by neutralising their painting operator in the content stream.
 * Coordinates are in raw PDF user space (y axis up), the same space as TextSuppression.
 */

type Pt = [number, number]

interface Subpath {
  pts: Pt[]
  curved: boolean
  closed: boolean
  isRe: boolean
}

interface GState {
  ctm: Matrix
  fill: string | null
  stroke: string | null
  lineWidth: number
}

type RawShape = Omit<PdfShape, 'id'>

const PAINT_OPS: Record<string, 'stroke' | 'fill' | 'both'> = {
  S: 'stroke',
  s: 'stroke',
  f: 'fill',
  F: 'fill',
  'f*': 'fill',
  B: 'both',
  'B*': 'both',
  b: 'both',
  'b*': 'both',
}

const MAX_SHAPES = 1500
const MAX_FORM_DEPTH = 6

// ── Colours ───────────────────────────────────────────────────────────────────

function hex2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v * 255)))
    .toString(16)
    .padStart(2, '0')
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

function colorFromNumbers(nums: number[]): string | null {
  if (nums.length === 1) return rgbHex(nums[0]!, nums[0]!, nums[0]!)
  if (nums.length === 3) return rgbHex(nums[0]!, nums[1]!, nums[2]!)
  if (nums.length === 4) {
    const [c, m, y, k] = nums as [number, number, number, number]
    return rgbHex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))
  }
  return null
}

// ── Geometry ──────────────────────────────────────────────────────────────────

function applyMatrix(m: Matrix, x: number, y: number): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

const EPS = 0.01

function isAxisAlignedQuad(p: Pt[]): boolean {
  if (p.length !== 4) return false
  for (let i = 0; i < 4; i++) {
    const a = p[i]!
    const b = p[(i + 1) % 4]!
    const horizontal = Math.abs(a[1] - b[1]) < EPS
    const vertical = Math.abs(a[0] - b[0]) < EPS
    if (!horizontal && !vertical) return false
  }
  return true
}

function buildShape(
  subs: Subpath[],
  st: GState,
  paint: 'stroke' | 'fill' | 'both',
): RawShape | null {
  if (subs.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const transformed = subs.map((s) =>
    s.pts.map((p) => {
      const t = applyMatrix(st.ctm, p[0], p[1])
      if (t[0] < minX) minX = t[0]
      if (t[0] > maxX) maxX = t[0]
      if (t[1] < minY) minY = t[1]
      if (t[1] > maxY) maxY = t[1]
      return t
    }),
  )
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null

  const w = maxX - minX
  const h = maxY - minY
  if (w < EPS && h < EPS) return null

  const scale = Math.sqrt(Math.abs(st.ctm[0] * st.ctm[3] - st.ctm[1] * st.ctm[2])) || 1
  const strokeWidth = paint === 'fill' ? 0 : st.lineWidth * scale

  let kind: RawShape['kind'] = 'path'
  let line: RawShape['line']

  if (subs.length === 1) {
    const sub = subs[0]!
    const pts = transformed[0]!
    if (!sub.curved) {
      let quad = pts
      if (quad.length === 5) {
        const first = quad[0]!
        const last = quad[4]!
        if (Math.abs(first[0] - last[0]) < EPS && Math.abs(first[1] - last[1]) < EPS) {
          quad = quad.slice(0, 4)
        }
      }
      if (isAxisAlignedQuad(quad) && (w >= EPS || h >= EPS)) {
        kind = 'rect'
      } else if (pts.length === 2 && !sub.closed && paint !== 'fill') {
        kind = 'line'
        line = [pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1]]
      }
    }
  }

  return {
    kind,
    paint,
    box: { x0: minX, y0: minY, x1: maxX, y1: maxY },
    line,
    strokeColor: paint === 'fill' ? null : st.stroke,
    fillColor: paint === 'stroke' ? null : st.fill,
    strokeWidth,
  }
}

// ── Content stream walker ─────────────────────────────────────────────────────

interface WalkParams {
  src: string
  initial: GState
  resources?: PDFDict
  doc: PDFDocument
  /** Return true to remove the painting operator of this shape */
  onShape: (shape: RawShape) => boolean
  /** When true, modified form XObjects are written back into the document */
  rewrite: boolean
  visitedForms: Set<string>
  depth: number
}

function walkContent(p: WalkParams): { output: string; changed: boolean } {
  const tokens = tokenizeContentStream(p.src)
  const replacements: { start: number; end: number; text: string }[] = []

  let st: GState = { ...p.initial, ctm: [...p.initial.ctm] as Matrix }
  const stack: GState[] = []
  let subs: Subpath[] = []
  let cur: Subpath | null = null
  let anyFormChanged = false
  const operands: Token[] = []

  const num = (fromEnd: number): number => operands[operands.length - fromEnd]?.num ?? 0
  const nums = (): number[] =>
    operands.filter((t) => t.kind === 'num').map((t) => t.num ?? 0)
  const hasPatternOperand = () => operands.some((t) => t.kind === 'name')

  for (const tok of tokens) {
    if (tok.kind !== 'op') {
      operands.push(tok)
      continue
    }

    const op = tok.raw
    switch (op) {
      case 'q':
        stack.push({ ...st, ctm: [...st.ctm] as Matrix })
        break
      case 'Q': {
        const prev = stack.pop()
        if (prev) st = prev
        break
      }
      case 'cm':
        if (operands.length >= 6) {
          st.ctm = mulMat([num(6), num(5), num(4), num(3), num(2), num(1)], st.ctm)
        }
        break
      case 'w':
        if (operands.length >= 1) st.lineWidth = num(1)
        break

      // colours
      case 'g':
      case 'rg':
      case 'k':
        st.fill = colorFromNumbers(nums())
        break
      case 'G':
      case 'RG':
      case 'K':
        st.stroke = colorFromNumbers(nums())
        break
      case 'sc':
      case 'scn':
        st.fill = hasPatternOperand() ? null : colorFromNumbers(nums())
        break
      case 'SC':
      case 'SCN':
        st.stroke = hasPatternOperand() ? null : colorFromNumbers(nums())
        break
      case 'cs':
        st.fill = operands[0]?.raw === '/Pattern' ? null : '#000000'
        break
      case 'CS':
        st.stroke = operands[0]?.raw === '/Pattern' ? null : '#000000'
        break

      // path construction
      case 'm': {
        if (operands.length >= 2) {
          cur = { pts: [[num(2), num(1)]], curved: false, closed: false, isRe: false }
          subs.push(cur)
        }
        break
      }
      case 'l':
        if (cur && operands.length >= 2) cur.pts.push([num(2), num(1)])
        break
      case 'c':
        if (cur && operands.length >= 6) {
          cur.pts.push([num(6), num(5)], [num(4), num(3)], [num(2), num(1)])
          cur.curved = true
        }
        break
      case 'v':
      case 'y':
        if (cur && operands.length >= 4) {
          cur.pts.push([num(4), num(3)], [num(2), num(1)])
          cur.curved = true
        }
        break
      case 'h':
        if (cur) cur.closed = true
        break
      case 're':
        if (operands.length >= 4) {
          const x = num(4)
          const y = num(3)
          const w = num(2)
          const h = num(1)
          cur = {
            pts: [
              [x, y],
              [x + w, y],
              [x + w, y + h],
              [x, y + h],
            ],
            curved: false,
            closed: true,
            isRe: true,
          }
          subs.push(cur)
        }
        break

      // painting
      case 'n':
        subs = []
        cur = null
        break
      case 'S':
      case 's':
      case 'f':
      case 'F':
      case 'f*':
      case 'B':
      case 'B*':
      case 'b':
      case 'b*': {
        const paint = PAINT_OPS[op]!
        const shape = buildShape(subs, st, paint)
        if (shape && p.onShape(shape)) {
          replacements.push({ start: tok.start, end: tok.end, text: 'n' })
        }
        subs = []
        cur = null
        break
      }

      case 'Do': {
        const nameTok = operands[operands.length - 1]
        if (!p.resources || nameTok?.kind !== 'name' || p.depth >= MAX_FORM_DEPTH) break
        const xobjDict = p.resources.lookup(PDFName.of('XObject'))
        if (!(xobjDict instanceof PDFDict)) break
        const rawName = nameTok.raw.slice(1)
        const refOrStream = xobjDict.get(PDFName.of(rawName))
        const resolved = xobjDict.lookup(PDFName.of(rawName))
        if (!(resolved instanceof PDFRawStream)) break
        const subtype = resolved.dict.get(PDFName.of('Subtype'))
        if (!(subtype instanceof PDFName) || subtype.decodeText() !== 'Form') break

        const key = refOrStream instanceof PDFRef ? refOrStream.toString() : `inline:${rawName}`
        if (p.visitedForms.has(key)) break
        p.visitedForms.add(key)

        let formMatrix: Matrix = [...IDENTITY]
        const mArr = resolved.dict.lookup(PDFName.of('Matrix'))
        if (mArr instanceof PDFArray && mArr.size() === 6) {
          formMatrix = [
            Number(mArr.get(0).toString()) || 1,
            Number(mArr.get(1).toString()) || 0,
            Number(mArr.get(2).toString()) || 0,
            Number(mArr.get(3).toString()) || 1,
            Number(mArr.get(4).toString()) || 0,
            Number(mArr.get(5).toString()) || 0,
          ]
        }
        const formRes = resolved.dict.lookup(PDFName.of('Resources'))
        const out = walkContent({
          ...p,
          src: decodeStreamLatin1(resolved),
          initial: { ...st, ctm: mulMat(formMatrix, st.ctm) },
          resources: formRes instanceof PDFDict ? formRes : p.resources,
          depth: p.depth + 1,
        })
        // Extraction mode: the same form may legitimately be painted several times
        if (!p.rewrite) p.visitedForms.delete(key)
        if (out.changed && p.rewrite && refOrStream instanceof PDFRef) {
          const newStream = p.doc.context.flateStream(encodeLatin1(out.output))
          for (const [k, v] of resolved.dict.entries()) {
            const keyName = k.decodeText()
            if (keyName !== 'Length' && keyName !== 'Filter' && keyName !== 'DecodeParms') {
              newStream.dict.set(k, v)
            }
          }
          p.doc.context.assign(refOrStream, newStream)
          anyFormChanged = true
        }
        break
      }
      default:
        break
    }

    operands.length = 0
  }

  if (replacements.length === 0) {
    return { output: p.src, changed: anyFormChanged }
  }

  let out = ''
  let cursor = 0
  for (const r of replacements) {
    out += p.src.slice(cursor, r.start) + r.text
    cursor = r.end
  }
  out += p.src.slice(cursor)
  return { output: out, changed: true }
}

function pageContentSource(page: PDFPage): string | null {
  const contents = page.node.Contents()
  if (!contents) return null
  const parts: string[] = []
  if (contents instanceof PDFRawStream) {
    parts.push(decodeStreamLatin1(contents))
  } else if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const looked = contents.lookup(i)
      if (looked instanceof PDFRawStream) parts.push(decodeStreamLatin1(looked))
    }
  }
  return parts.length > 0 ? parts.join('\n') : null
}

const INITIAL_STATE: GState = {
  ctm: [...IDENTITY],
  fill: '#000000',
  stroke: '#000000',
  lineWidth: 1,
}

// ── Grouping of frames drawn as separate lines / thin bars ─────────────────────

interface Bar {
  index: number
  orient: 'h' | 'v'
  /** y for horizontal bars, x for vertical bars */
  pos: number
  lo: number
  hi: number
  thickness: number
  color: string
}

const MAX_BARS = 400

function toBar(shape: RawShape, index: number): Bar | null {
  if (shape.kind === 'line' && shape.line && shape.strokeColor) {
    const [x1, y1, x2, y2] = shape.line
    if (Math.abs(y1 - y2) < 0.05) {
      return {
        index,
        orient: 'h',
        pos: y1,
        lo: Math.min(x1, x2),
        hi: Math.max(x1, x2),
        thickness: shape.strokeWidth,
        color: shape.strokeColor,
      }
    }
    if (Math.abs(x1 - x2) < 0.05) {
      return {
        index,
        orient: 'v',
        pos: x1,
        lo: Math.min(y1, y2),
        hi: Math.max(y1, y2),
        thickness: shape.strokeWidth,
        color: shape.strokeColor,
      }
    }
    return null
  }
  if (shape.kind === 'rect' && shape.paint === 'fill' && shape.fillColor) {
    const w = shape.box.x1 - shape.box.x0
    const h = shape.box.y1 - shape.box.y0
    if (Math.min(w, h) <= 2.5 && Math.max(w, h) >= 8) {
      if (w > h) {
        return {
          index,
          orient: 'h',
          pos: (shape.box.y0 + shape.box.y1) / 2,
          lo: shape.box.x0,
          hi: shape.box.x1,
          thickness: h,
          color: shape.fillColor,
        }
      }
      return {
        index,
        orient: 'v',
        pos: (shape.box.x0 + shape.box.x1) / 2,
        lo: shape.box.y0,
        hi: shape.box.y1,
        thickness: w,
        color: shape.fillColor,
      }
    }
  }
  return null
}

/**
 * Many generators (LaTeX fbox/fcolorbox, Word tables...) draw a frame as four separate
 * lines plus an optional background. Merge them into one editable rectangle.
 */
function groupFrames(shapes: RawShape[]): RawShape[] {
  const bars: Bar[] = []
  shapes.forEach((s, i) => {
    const b = toBar(s, i)
    if (b && bars.length < MAX_BARS) bars.push(b)
  })
  if (bars.length < 4) return shapes

  const used = new Set<number>()
  const replaced = new Map<number, RawShape>()

  const byColor = new Map<string, Bar[]>()
  for (const b of bars) {
    const list = byColor.get(b.color) ?? []
    list.push(b)
    byColor.set(b.color, list)
  }

  for (const list of byColor.values()) {
    const hs = list.filter((b) => b.orient === 'h')
    const vs = list.filter((b) => b.orient === 'v')
    for (const top of hs) {
      if (used.has(top.index)) continue
      for (const bottom of hs) {
        if (bottom === top || used.has(bottom.index) || used.has(top.index)) continue
        if (top.pos < bottom.pos + 3) continue
        const tol = Math.max(1.5, 3 * Math.max(top.thickness, bottom.thickness))
        if (Math.abs(top.lo - bottom.lo) > tol || Math.abs(top.hi - bottom.hi) > tol) continue

        const matchSide = (x: number): Bar | undefined =>
          vs.find(
            (v) =>
              !used.has(v.index) &&
              Math.abs(v.pos - x) <= tol &&
              Math.abs(v.lo - bottom.pos) <= tol &&
              Math.abs(v.hi - top.pos) <= tol,
          )
        const left = matchSide(Math.min(top.lo, bottom.lo))
        const right = matchSide(Math.max(top.hi, bottom.hi))
        if (!left || !right || left === right) continue

        const frame = [top, bottom, left, right]
        const thickness = frame.reduce((acc, b) => acc + b.thickness, 0) / 4
        const box: PdfBox = { x0: left.pos, y0: bottom.pos, x1: right.pos, y1: top.pos }
        const members: PdfBox[] = frame.map((b) => shapes[b.index]!.box)
        frame.forEach((b) => used.add(b.index))

        // Background rectangle painted inside the frame
        const fillTol = Math.max(2, 3 * thickness)
        let fillColor: string | null = null
        shapes.forEach((s, i) => {
          if (fillColor || used.has(i) || s.kind !== 'rect' || s.paint === 'stroke' || !s.fillColor) {
            return
          }
          if (
            Math.abs(s.box.x0 - box.x0) <= fillTol &&
            Math.abs(s.box.y0 - box.y0) <= fillTol &&
            Math.abs(s.box.x1 - box.x1) <= fillTol &&
            Math.abs(s.box.y1 - box.y1) <= fillTol
          ) {
            fillColor = s.fillColor
            members.push(s.box)
            used.add(i)
          }
        })

        const firstIndex = Math.min(...frame.map((b) => b.index))
        replaced.set(firstIndex, {
          kind: 'rect',
          paint: fillColor ? 'both' : 'stroke',
          box,
          strokeColor: top.color,
          fillColor,
          strokeWidth: Math.max(0.25, Math.round(thickness * 100) / 100),
          members,
        })
      }
    }
  }

  if (used.size === 0) return shapes
  const out: RawShape[] = []
  shapes.forEach((s, i) => {
    const group = replaced.get(i)
    if (group) out.push(group)
    if (!used.has(i)) out.push(s)
  })
  return out
}

/** An arrow is drawn as a line plus a small separate head: merge them into one shape. */
function groupArrowHeads(shapes: RawShape[]): RawShape[] {
  const out = [...shapes]
  const removed = new Set<number>()

  shapes.forEach((line, li) => {
    if (line.kind !== 'line' || !line.line || !line.strokeColor) return
    const [x1, y1, x2, y2] = line.line
    for (let pi = 0; pi < shapes.length; pi++) {
      if (pi === li || removed.has(pi)) continue
      const p = shapes[pi]!
      if (p.kind !== 'path') continue
      const w = p.box.x1 - p.box.x0
      const h = p.box.y1 - p.box.y0
      if (w > 14 || h > 14 || (w < 0.5 && h < 0.5)) continue
      const color = p.paint === 'fill' ? p.fillColor : p.strokeColor
      if (color !== line.strokeColor) continue
      const near = (x: number, y: number) =>
        x >= p.box.x0 - 1.5 && x <= p.box.x1 + 1.5 && y >= p.box.y0 - 1.5 && y <= p.box.y1 + 1.5
      const atEnd = near(x2, y2)
      const atStart = near(x1, y1)
      if (!atEnd && !atStart) continue
      out[li] = {
        ...line,
        line: atEnd ? line.line : [x2, y2, x1, y1],
        arrow: true,
        members: [...(line.members ?? [line.box]), p.box],
      }
      removed.add(pi)
      break
    }
  })
  return out.filter((_, i) => !removed.has(i))
}

// ── Public API ────────────────────────────────────────────────────────────────

const docCache = new WeakMap<Uint8Array, Promise<PDFDocument>>()

/** Lists the vector shapes painted on one page of the given PDF. */
export async function extractPageShapes(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<PdfShape[]> {
  let docPromise = docCache.get(bytes)
  if (!docPromise) {
    docPromise = PDFDocument.load(bytes, { updateMetadata: false })
    docCache.set(bytes, docPromise)
  }
  const doc = await docPromise
  const page = doc.getPages()[pageIndex]
  if (!page) return []
  const src = pageContentSource(page)
  if (!src) return []

  const raw: RawShape[] = []
  walkContent({
    src,
    initial: INITIAL_STATE,
    resources: page.node.Resources(),
    doc,
    rewrite: false,
    visitedForms: new Set(),
    depth: 0,
    onShape: (shape) => {
      if (raw.length < MAX_SHAPES + 1) raw.push(shape)
      return false
    },
  })
  // Pages made of thousands of tiny paths (vector text, maps) are not editable shape by shape
  if (raw.length > MAX_SHAPES) return []
  // Ids come from the geometry so a selection survives a reload of the working PDF
  const seen = new Map<string, number>()
  return groupArrowHeads(groupFrames(raw)).map((shape) => {
    const b = shape.box
    const base = `${shape.kind}:${b.x0.toFixed(1)},${b.y0.toFixed(1)},${b.x1.toFixed(1)},${b.y1.toFixed(1)}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return { ...shape, id: n === 0 ? base : `${base}#${n}` }
  })
}

function sameBox(a: PdfBox, b: PdfBox): boolean {
  const tol = 0.05
  return (
    Math.abs(a.x0 - b.x0) < tol &&
    Math.abs(a.y0 - b.y0) < tol &&
    Math.abs(a.x1 - b.x1) < tol &&
    Math.abs(a.y1 - b.y1) < tol
  )
}

/** Removes the painting operators of the suppressed shapes. Returns the new PDF bytes. */
export async function stripSuppressedShapesFromPdf(
  rawBytes: Uint8Array,
  suppressions: ShapeSuppression[],
): Promise<Uint8Array> {
  if (suppressions.length === 0) return rawBytes

  const byPage = new Map<number, ShapeSuppression[]>()
  for (const s of suppressions) {
    const arr = byPage.get(s.originalPageIndex) ?? []
    arr.push(s)
    byPage.set(s.originalPageIndex, arr)
  }

  const doc = await PDFDocument.load(rawBytes, { updateMetadata: false })
  const pages = doc.getPages()
  let changedAny = false

  for (const [pageIdx, targets] of byPage.entries()) {
    const page = pages[pageIdx]
    if (!page) continue
    const src = pageContentSource(page)
    if (!src) continue

    const result = walkContent({
      src,
      initial: INITIAL_STATE,
      resources: page.node.Resources(),
      doc,
      rewrite: true,
      visitedForms: new Set(),
      depth: 0,
      onShape: (shape) => targets.some((t) => t.boxes.some((b) => sameBox(b, shape.box))),
    })

    if (result.changed) {
      changedAny = true
      if (result.output !== src) {
        const newStream = doc.context.flateStream(encodeLatin1(result.output))
        page.node.set(PDFName.of('Contents'), doc.context.register(newStream))
      }
    }
  }

  return changedAny ? await doc.save() : rawBytes
}
