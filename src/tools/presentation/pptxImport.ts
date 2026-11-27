import JSZip from 'jszip'
import {
  DEFAULT_FONT, DEFAULT_H, DEFAULT_W, newShape, uid,
  type Align, type Deck, type GeomKind, type Para, type Run, type Slide, type SlideEl, type TableEl, type VAlign,
} from './model'

const EMU = 9525 // EMU per CSS px
const emu = (v: string | null | undefined, d = 0) => (v ? Number(v) / EMU : d)

type X = Element

const kids = (e: X | null | undefined, name?: string): X[] =>
  e ? ([...e.children] as X[]).filter((c) => !name || c.localName === name) : []
const kid = (e: X | null | undefined, name: string): X | null => kids(e, name)[0] ?? null
const path = (e: X | null | undefined, ...names: string[]): X | null => {
  let cur = e ?? null
  for (const n of names) cur = kid(cur, n)
  return cur
}
const attr = (e: X | null | undefined, n: string) => e?.getAttribute(n) ?? null

const parseXml = (s: string) => new DOMParser().parseFromString(s, 'application/xml').documentElement

interface Ctx {
  zip: JSZip
  scheme: Record<string, string>
  majorFont: string
  minorFont: string
}

const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/') + 1)
function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = (dirOf(base) + target).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.' && p !== '') out.push(p)
  }
  return out.join('/')
}

async function readXml(zip: JSZip, p: string): Promise<X | null> {
  const f = zip.file(p)
  return f ? parseXml(await f.async('string')) : null
}

async function readRels(zip: JSZip, part: string): Promise<Record<string, { target: string; type: string }>> {
  const relPath = `${dirOf(part)}_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels`
  const x = await readXml(zip, relPath)
  const out: Record<string, { target: string; type: string }> = {}
  for (const r of kids(x, 'Relationship')) {
    out[attr(r, 'Id')!] = { target: resolve(part, attr(r, 'Target')!), type: (attr(r, 'Type') ?? '').split('/').pop()! }
  }
  return out
}

// ── Colours ───────────────────────────────────────────────────────────────────

function hslOf(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
function rgbOf(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

interface Paint { color: string; alpha: number }

function colorOf(el: X | null, ctx: Ctx, map: Record<string, string>): Paint | null {
  if (!el) return null
  let base: string | null = null
  const t = el.localName
  if (t === 'srgbClr') base = attr(el, 'val')
  else if (t === 'sysClr') base = attr(el, 'lastClr') ?? '000000'
  else if (t === 'prstClr') base = ({ black: '000000', white: 'ffffff', red: 'ff0000', green: '00ff00', blue: '0000ff', yellow: 'ffff00' } as Record<string, string>)[attr(el, 'val') ?? ''] ?? '000000'
  else if (t === 'schemeClr') {
    const v = attr(el, 'val') ?? 'tx1'
    base = ctx.scheme[map[v] ?? v] ?? ctx.scheme[v] ?? null
  }
  if (!base) return null
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(base!.slice(i, i + 2), 16))
  let alpha = 1
  let [h, s, l] = hslOf(r!, g!, b!)
  for (const m of kids(el)) {
    const v = Number(attr(m, 'val')) / 100000
    switch (m.localName) {
      case 'lumMod': l *= v; break
      case 'lumOff': l += v; break
      case 'satMod': s *= v; break
      case 'tint': l = l + (1 - l) * (1 - v); break
      case 'shade': l *= v; break
      case 'alpha': alpha = v; break
    }
  }
  ;[r, g, b] = rgbOf(h, s, Math.max(0, Math.min(1, l))) as [number, number, number]
  return { color: `#${hex2(r!)}${hex2(g!)}${hex2(b!)}`, alpha }
}

function fillOf(sp: X | null, ctx: Ctx, map: Record<string, string>): Paint | null | undefined {
  // undefined = nothing specified, null = explicit noFill
  if (!sp) return undefined
  for (const c of kids(sp)) {
    if (c.localName === 'noFill') return null
    if (c.localName === 'solidFill') return colorOf(kids(c)[0] ?? null, ctx, map)
    if (c.localName === 'gradFill') return colorOf(kids(kid(c, 'gsLst'), 'gs')[0] ? kids(kids(kid(c, 'gsLst'), 'gs')[0])[0] ?? null : null, ctx, map)
  }
  return undefined
}

// ── Theme ─────────────────────────────────────────────────────────────────────

async function loadTheme(zip: JSZip, masterPath: string, rels: Record<string, { target: string; type: string }>): Promise<Pick<Ctx, 'scheme' | 'majorFont' | 'minorFont'>> {
  const themePath = Object.values(rels).find((r) => r.type === 'theme')?.target
  const theme = themePath ? await readXml(zip, themePath) : null
  void masterPath
  const scheme: Record<string, string> = { dk1: '000000', lt1: 'ffffff', dk2: '1f2937', lt2: 'f3f4f6' }
  const cs = path(theme, 'themeElements', 'clrScheme')
  for (const c of kids(cs)) {
    const v = kids(c)[0]
    if (v) scheme[c.localName] = attr(v, 'lastClr') ?? attr(v, 'val') ?? '000000'
  }
  const fs = path(theme, 'themeElements', 'fontScheme')
  return {
    scheme,
    majorFont: attr(path(fs, 'majorFont', 'latin'), 'typeface') ?? DEFAULT_FONT,
    minorFont: attr(path(fs, 'minorFont', 'latin'), 'typeface') ?? DEFAULT_FONT,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

interface Xf { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean }
interface GroupT { ox: number; oy: number; sx: number; sy: number } // child -> slide

function xfOf(xfrm: X | null, g: GroupT | null): Xf | null {
  if (!xfrm) return null
  const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext')
  if (!off || !ext) return null
  let x = emu(attr(off, 'x')), y = emu(attr(off, 'y')), w = emu(attr(ext, 'cx')), h = emu(attr(ext, 'cy'))
  if (g) {
    x = g.ox + x * g.sx
    y = g.oy + y * g.sy
    w *= g.sx
    h *= g.sy
  }
  return { x, y, w, h, rot: Number(attr(xfrm, 'rot') ?? 0) / 60000, flipH: attr(xfrm, 'flipH') === '1', flipV: attr(xfrm, 'flipV') === '1' }
}

// ── Text ──────────────────────────────────────────────────────────────────────

interface TextDefaults { size?: number; color?: string; bold?: boolean; italic?: boolean; font?: string; align?: Align; bullet?: boolean }

function readRPr(rPr: X | null, ctx: Ctx, map: Record<string, string>, out: TextDefaults) {
  if (!rPr) return
  const sz = attr(rPr, 'sz')
  if (sz) out.size = Number(sz) / 100
  if (attr(rPr, 'b') != null) out.bold = attr(rPr, 'b') === '1'
  if (attr(rPr, 'i') != null) out.italic = attr(rPr, 'i') === '1'
  const f = fillOf(rPr, ctx, map)
  if (f) out.color = f.color
  const lat = attr(kid(rPr, 'latin'), 'typeface')
  if (lat) out.font = lat === '+mj-lt' ? ctx.majorFont : lat === '+mn-lt' ? ctx.minorFont : lat
}

function lvlDefaults(lst: X | null, lvl: number, ctx: Ctx, map: Record<string, string>): TextDefaults {
  const out: TextDefaults = {}
  const p = kid(lst, `lvl${lvl + 1}pPr`)
  if (!p) return out
  readRPr(kid(p, 'defRPr'), ctx, map, out)
  const al = attr(p, 'algn')
  if (al) out.align = al === 'ctr' ? 'center' : al === 'r' ? 'right' : al === 'just' ? 'justify' : 'left'
  if (kid(p, 'buChar') || kid(p, 'buAutoNum')) out.bullet = true
  if (kid(p, 'buNone')) out.bullet = false
  return out
}

function paragraphs(txBody: X | null, ctx: Ctx, map: Record<string, string>, chain: (X | null)[], fallback: TextDefaults): Para[] {
  if (!txBody) return []
  const out: Para[] = []
  for (const p of kids(txBody, 'p')) {
    const pPr = kid(p, 'pPr')
    const lvl = Number(attr(pPr, 'lvl') ?? 0)
    // defaults from lower priority (master) to higher (own lstStyle)
    let d: TextDefaults = { ...fallback }
    for (const lst of chain) d = { ...d, ...lvlDefaults(lst, lvl, ctx, map) }
    const own = lvlDefaults({ children: [], localName: '' } as unknown as X, 0, ctx, map)
    void own
    const para: Para = { runs: [] }
    const al = attr(pPr, 'algn')
    para.align = al ? (al === 'ctr' ? 'center' : al === 'r' ? 'right' : al === 'just' ? 'justify' : 'left') : d.align ?? 'left'
    if (kid(pPr, 'buChar') || kid(pPr, 'buAutoNum')) para.bullet = kid(pPr, 'buAutoNum') ? 'number' : 'bullet'
    else if (kid(pPr, 'buNone')) para.bullet = 'none'
    else if (d.bullet) para.bullet = 'bullet'
    if (lvl) para.level = lvl
    const ls = attr(path(pPr, 'lnSpc', 'spcPct'), 'val')
    if (ls) para.lineSpacing = Math.round((Number(ls) / 100000) * 1.2 * 100) / 100

    // paragraph level defRPr / endParaRPr as base for its runs
    const pd: TextDefaults = { ...d }
    for (const r of kids(p)) {
      if (r.localName === 'br') {
        para.runs.push({ text: '\n', size: pd.size })
        continue
      }
      if (r.localName !== 'r' && r.localName !== 'fld') continue
      const t = kid(r, 't')?.textContent ?? ''
      if (!t) continue
      const rd: TextDefaults = { ...pd }
      readRPr(kid(r, 'rPr'), ctx, map, rd)
      const run: Run = { text: t }
      if (rd.size) run.size = rd.size
      if (rd.color) run.color = rd.color
      if (rd.bold) run.bold = true
      if (rd.italic) run.italic = true
      if (rd.font) run.font = rd.font
      const rPr = kid(r, 'rPr')
      if (attr(rPr, 'u') && attr(rPr, 'u') !== 'none') run.underline = true
      if (attr(rPr, 'strike') && attr(rPr, 'strike') !== 'noStrike') run.strike = true
      const hl = colorOf(kids(kid(rPr, 'highlight'))[0] ?? null, ctx, map)
      if (hl) run.highlight = hl.color
      para.runs.push(run)
    }
    if (!para.runs.length) {
      const e = kid(p, 'endParaRPr')
      const rd: TextDefaults = { ...pd }
      readRPr(e, ctx, map, rd)
      if (rd.size) para.runs = []
    }
    out.push(para)
  }
  return out
}

// ── Geometry mapping ──────────────────────────────────────────────────────────

const PRESET: Record<string, GeomKind> = {
  rect: 'rect', roundRect: 'roundRect', round1Rect: 'roundRect', round2SameRect: 'roundRect', snip1Rect: 'rect', ellipse: 'ellipse',
  triangle: 'triangle', rtTriangle: 'rtTriangle', diamond: 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', octagon: 'octagon',
  star5: 'star5', star4: 'star4', plus: 'plus', mathPlus: 'plus', rightArrow: 'rightArrow', leftArrow: 'leftArrow', upArrow: 'upArrow',
  downArrow: 'downArrow', chevron: 'chevron', homePlate: 'homePlate', trapezoid: 'trapezoid', parallelogram: 'parallelogram', heart: 'heart',
  line: 'line', straightConnector1: 'line', bentConnector3: 'line', curvedConnector3: 'line',
  flowChartProcess: 'rect', flowChartAlternateProcess: 'roundRect', flowChartDecision: 'diamond', flowChartTerminator: 'roundRect',
}

// ── Pictures ──────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' }

const imgCache = new Map<string, string | null>()
async function imageUrl(zip: JSZip, p: string): Promise<string | null> {
  if (imgCache.has(p)) return imgCache.get(p)!
  const ext = p.split('.').pop()!.toLowerCase()
  const mime = MIME[ext]
  const f = zip.file(p)
  let url: string | null = null
  if (f && mime) url = `data:${mime};base64,${await f.async('base64')}`
  imgCache.set(p, url)
  return url
}

/** Crops (a:srcRect) a picture to a new data URL via canvas */
async function cropImage(src: string, l: number, t: number, r: number, b: number): Promise<string> {
  if (!l && !t && !r && !b) return src
  const img = new Image()
  img.src = src
  try {
    await img.decode()
  } catch {
    return src
  }
  const sw = img.naturalWidth * (1 - l - r), sh = img.naturalHeight * (1 - t - b)
  if (sw <= 0 || sh <= 0) return src
  const c = document.createElement('canvas')
  c.width = Math.round(sw)
  c.height = Math.round(sh)
  c.getContext('2d')!.drawImage(img, img.naturalWidth * l, img.naturalHeight * t, sw, sh, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

// ── Part walker ───────────────────────────────────────────────────────────────

interface PartCtx {
  ctx: Ctx
  map: Record<string, string>
  rels: Record<string, { target: string; type: string }>
  partPath: string
  /** placeholder lookups from layout/master */
  ph: PhIndex | null
  /** master text styles */
  txStyles: X | null
  locked: boolean
}

interface PhInfo { xfrm: Xf | null; lst: X | null; bodyPr: X | null }
type PhIndex = { byIdx: Map<string, PhInfo>; byType: Map<string, PhInfo> }

function phKey(sp: X) {
  const ph = path(sp, 'nvSpPr', 'nvPr', 'ph')
  if (!ph) return null
  return { idx: attr(ph, 'idx'), type: attr(ph, 'type') ?? 'body' }
}

function indexPlaceholders(tree: X | null, upper: PhIndex | null): PhIndex {
  const idx: PhIndex = { byIdx: new Map(), byType: new Map() }
  const walk = (e: X | null) => {
    for (const sp of kids(e, 'sp')) {
      const k = phKey(sp)
      if (!k) continue
      const info: PhInfo = { xfrm: xfOf(path(sp, 'spPr', 'xfrm'), null), lst: path(sp, 'txBody', 'lstStyle'), bodyPr: path(sp, 'txBody', 'bodyPr') }
      const parent = (k.idx && upper?.byIdx.get(k.idx)) || upper?.byType.get(normType(k.type))
      if (parent) {
        info.xfrm ??= parent.xfrm
        info.bodyPr ??= parent.bodyPr
      }
      if (k.idx) idx.byIdx.set(k.idx, info)
      idx.byType.set(normType(k.type), info)
    }
  }
  walk(path(tree, 'cSld', 'spTree'))
  return idx
}

const normType = (t: string) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' ? 'subTitle' : t)

function parseSp(sp: X, pc: PartCtx, g: GroupT | null, out: SlideEl[], order: { n: number }) {
  void order
  const { ctx, map } = pc
  const k = phKey(sp)
  if (k && pc.locked) return // layout / master placeholders are prompts only
  const spPr = kid(sp, 'spPr')
  const ownXf = xfOf(kid(spPr, 'xfrm'), g)
  let inherited: PhInfo | undefined
  if (k) inherited = (k.idx && pc.ph?.byIdx.get(k.idx)) || pc.ph?.byType.get(normType(k.type)) || undefined
  const xf = ownXf ?? (inherited?.xfrm ? { ...inherited.xfrm } : null)
  if (!xf) return

  const prst = attr(path(spPr, 'prstGeom'), 'prst') ?? (kid(spPr, 'custGeom') ? 'rect' : 'rect')
  const geom: GeomKind = PRESET[prst] ?? 'rect'
  const fill = fillOf(spPr, ctx, map)
  const ln = kid(spPr, 'ln')
  const lnFill = fillOf(ln, ctx, map)
  // style reference (fillRef/lnRef) as a fallback when the shape has no own fill
  const style = kid(sp, 'style')
  const fillRef = colorOf(kids(kid(style, 'fillRef'))[0] ?? null, ctx, map)
  const lnRef = colorOf(kids(kid(style, 'lnRef'))[0] ?? null, ctx, map)
  const fillFinal = fill === undefined ? (k || !style ? null : fillRef) : fill
  const lineFinal = lnFill === undefined ? (k || !style ? null : lnRef) : lnFill

  const txBody = kid(sp, 'txBody')
  // text defaults chain: master style -> layout lst -> own lst
  const typ = k ? normType(k.type) : 'other'
  const styleName = typ === 'title' ? 'titleStyle' : typ === 'body' || typ === 'subTitle' || typ === 'obj' ? 'bodyStyle' : 'otherStyle'
  const masterLst = path(pc.txStyles, styleName)
  const fallback: TextDefaults = { size: 18, color: ctx.scheme[map.tx1 ?? 'dk1'] ? '#' + ctx.scheme[map.tx1 ?? 'dk1'] : '#000000', font: typ === 'title' ? ctx.majorFont : ctx.minorFont }
  const fontRef = attr(path(style, 'fontRef'), 'idx')
  void fontRef
  const fr = colorOf(kids(kid(style, 'fontRef'))[0] ?? null, ctx, map)
  if (fr && !k) fallback.color = fr.color
  const paras = paragraphs(txBody, ctx, map, [masterLst, inherited?.lst ?? null, path(txBody, 'lstStyle')], fallback)

  const bodyPr = kid(txBody, 'bodyPr')
  const anchor = attr(bodyPr, 'anchor') ?? attr(inherited?.bodyPr ?? null, 'anchor')
  const valign: VAlign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top'
  const lIns = attr(bodyPr, 'lIns')
  const pad = lIns != null ? emu(lIns) : 9.6

  const first = paras.flatMap((p) => p.runs)[0]
  const el = newShape({
    x: xf.x, y: xf.y, w: xf.w, h: xf.h, rot: xf.rot, flipH: xf.flipH, flipV: xf.flipV,
    geom,
    fill: fillFinal?.color ?? null,
    fillAlpha: fillFinal && fillFinal.alpha < 1 ? fillFinal.alpha : undefined,
    line: lineFinal?.color ?? null,
    lineW: attr(ln, 'w') ? Number(attr(ln, 'w')) / 12700 : lineFinal ? 1 : 0,
    paras,
    valign,
    pad,
    base: { size: first?.size ?? fallback.size ?? 18, color: first?.color ?? fallback.color ?? '#000000', font: first?.font ?? fallback.font ?? DEFAULT_FONT },
    locked: pc.locked,
  })
  const dash = attr(kid(ln, 'prstDash'), 'val')
  if (dash && dash !== 'solid') el.dash = dash.includes('dot') || dash === 'sysDot' ? 'dot' : 'dash'
  if (kid(ln, 'tailEnd') && attr(kid(ln, 'tailEnd'), 'type') !== 'none') el.arrowEnd = true
  if (kid(ln, 'headEnd') && attr(kid(ln, 'headEnd'), 'type') !== 'none') el.arrowStart = true
  if (path(spPr, 'effectLst', 'outerShdw')) el.shadow = true
  if (pc.locked && !paras.some((p) => p.runs.length) && !el.fill && !el.line) return
  // an empty placeholder is only an editing hint in PowerPoint; keep it editable but invisible
  out.push(el)
}

async function parsePic(pic: X, pc: PartCtx, g: GroupT | null, out: SlideEl[]) {
  const xf = xfOf(path(pic, 'spPr', 'xfrm'), g)
  if (!xf) return
  const blip = path(pic, 'blipFill', 'blip')
  const rid = attr(blip, 'r:embed') ?? blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')
  const target = rid ? pc.rels[rid]?.target : null
  if (!target) return
  let src = await imageUrl(pc.ctx.zip, target)
  if (!src) return
  const sr = path(pic, 'blipFill', 'srcRect')
  if (sr) {
    const v = (n: string) => Number(attr(sr, n) ?? 0) / 100000
    src = await cropImage(src, v('l'), v('t'), v('r'), v('b'))
  }
  out.push({ id: uid(), kind: 'image', src, x: xf.x, y: xf.y, w: xf.w, h: xf.h, rot: xf.rot, flipH: xf.flipH, flipV: xf.flipV, locked: pc.locked })
}

function parseTable(frame: X, pc: PartCtx, g: GroupT | null, out: SlideEl[]) {
  const tbl = path(frame, 'graphic', 'graphicData', 'tbl')
  const xf = xfOf(kid(frame, 'xfrm'), g)
  if (!tbl || !xf) return
  const colW = kids(kid(tbl, 'tblGrid'), 'gridCol').map((c) => emu(attr(c, 'w')))
  const trs = kids(tbl, 'tr')
  const rowH = trs.length ? trs.reduce((a, r) => a + emu(attr(r, 'h')), 0) / trs.length : 40
  let fontSize = 16
  const rows = trs.map((tr) =>
    kids(tr, 'tc').map((tc) => {
      const ps = paragraphs(kid(tc, 'txBody'), pc.ctx, pc.map, [], { size: 16 })
      const run = ps.flatMap((p) => p.runs)[0]
      if (run?.size) fontSize = run.size
      const f = fillOf(kid(tc, 'tcPr'), pc.ctx, pc.map)
      return {
        text: ps.map((p) => p.runs.map((r) => r.text).join('')).join('\n'),
        fill: f?.color,
        color: run?.color,
        bold: run?.bold,
        align: ps[0]?.align,
      }
    }),
  )
  const t: TableEl = {
    id: uid(), kind: 'table', x: xf.x, y: xf.y, w: colW.reduce((a, b) => a + b, 0) || xf.w, h: rowH * trs.length, rot: 0,
    rows, colW, rowH, fontSize, font: pc.ctx.minorFont, border: '#cbd5e1', header: attr(kid(tbl, 'tblPr'), 'firstRow') === '1', locked: pc.locked,
  }
  out.push(t)
}

function parseCxn(cx: X, pc: PartCtx, g: GroupT | null, out: SlideEl[]) {
  const spPr = kid(cx, 'spPr')
  const xf = xfOf(kid(spPr, 'xfrm'), g)
  if (!xf) return
  const ln = kid(spPr, 'ln')
  const lf = fillOf(ln, pc.ctx, pc.map) ?? colorOf(kids(path(cx, 'style', 'lnRef'))[0] ?? null, pc.ctx, pc.map)
  const el = newShape({
    x: xf.x, y: xf.y, w: xf.w, h: xf.h, rot: xf.rot, flipH: xf.flipH, flipV: xf.flipV, geom: 'line',
    line: lf?.color ?? '#000000', lineW: attr(ln, 'w') ? Number(attr(ln, 'w')) / 12700 : 1, locked: pc.locked,
  })
  if (attr(kid(ln, 'tailEnd'), 'type') && attr(kid(ln, 'tailEnd'), 'type') !== 'none') el.arrowEnd = true
  if (attr(kid(ln, 'headEnd'), 'type') && attr(kid(ln, 'headEnd'), 'type') !== 'none') el.arrowStart = true
  out.push(el)
}

async function walkTree(tree: X | null, pc: PartCtx, g: GroupT | null, out: SlideEl[], order = { n: 0 }) {
  for (const c of kids(tree)) {
    switch (c.localName) {
      case 'sp': parseSp(c, pc, g, out, order); break
      case 'pic': await parsePic(c, pc, g, out); break
      case 'cxnSp': parseCxn(c, pc, g, out); break
      case 'graphicFrame': parseTable(c, pc, g, out); break
      case 'grpSp': {
        const gx = kid(path(c, 'grpSpPr'), 'xfrm')
        const off = kid(gx, 'off'), ext = kid(gx, 'ext'), cho = kid(gx, 'chOff'), che = kid(gx, 'chExt')
        let t: GroupT = { ox: 0, oy: 0, sx: 1, sy: 1 }
        if (off && ext && cho && che) {
          const sx = emu(attr(ext, 'cx')) / (emu(attr(che, 'cx')) || 1)
          const sy = emu(attr(ext, 'cy')) / (emu(attr(che, 'cy')) || 1)
          t = { ox: emu(attr(off, 'x')) - emu(attr(cho, 'x')) * sx, oy: emu(attr(off, 'y')) - emu(attr(cho, 'y')) * sy, sx, sy }
          if (g) t = { ox: g.ox + t.ox * g.sx, oy: g.oy + t.oy * g.sy, sx: t.sx * g.sx, sy: t.sy * g.sy }
        } else if (g) t = g
        await walkTree(c, pc, t, out, order)
        break
      }
    }
  }
}

async function backgroundOf(bgEl: X | null, pc: PartCtx): Promise<{ color?: string; image?: string } | null> {
  const pr = path(bgEl, 'bgPr')
  if (!pr) {
    const ref = colorOf(kids(path(bgEl, 'bgRef'))[0] ?? null, pc.ctx, pc.map)
    return ref ? { color: ref.color } : null
  }
  const f = fillOf(pr, pc.ctx, pc.map)
  if (f) return { color: f.color }
  const blip = path(pr, 'blipFill', 'blip')
  const rid = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ?? attr(blip, 'r:embed')
  const t = rid ? pc.rels[rid]?.target : null
  const url = t ? await imageUrl(pc.ctx.zip, t) : null
  return url ? { image: url } : null
}

export interface ImportResult { deck: Deck; warnings: string[] }

export async function importPptx(file: File | ArrayBuffer): Promise<ImportResult> {
  imgCache.clear()
  const buf = file instanceof File ? await file.arrayBuffer() : file
  const zip = await JSZip.loadAsync(buf)
  const warnings: string[] = []

  const pres = await readXml(zip, 'ppt/presentation.xml')
  if (!pres) throw new Error('Not a valid PPTX file')
  const presRels = await readRels(zip, 'ppt/presentation.xml')
  const sz = kid(pres, 'sldSz')
  const w = emu(attr(sz, 'cx'), DEFAULT_W)
  const h = emu(attr(sz, 'cy'), DEFAULT_H)

  const slides: Slide[] = []
  const ids = kids(kid(pres, 'sldIdLst'), 'sldId')
  let sawUnsupported = false

  for (const sid of ids) {
    const rid = sid.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? attr(sid, 'r:id')
    const slidePath = rid ? presRels[rid]?.target : null
    if (!slidePath) continue
    const sx = await readXml(zip, slidePath)
    if (!sx) continue
    const sRels = await readRels(zip, slidePath)
    const layoutPath = Object.values(sRels).find((r) => r.type === 'slideLayout')?.target
    const lx = layoutPath ? await readXml(zip, layoutPath) : null
    const lRels = layoutPath ? await readRels(zip, layoutPath) : {}
    const masterPath = Object.values(lRels).find((r) => r.type === 'slideMaster')?.target
    const mx = masterPath ? await readXml(zip, masterPath) : null
    const mRels = masterPath ? await readRels(zip, masterPath) : {}
    const themePart = await loadTheme(zip, masterPath ?? '', mRels)
    const ctx: Ctx = { zip, ...themePart }

    const map: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }
    const cm = kid(mx, 'clrMap')
    if (cm) for (const a of [...cm.attributes]) map[a.name] = a.value
    const ovr = path(lx, 'clrMapOvr', 'overrideClrMapping')
    if (ovr) for (const a of [...ovr.attributes]) map[a.name] = a.value

    const masterIdx = indexPlaceholders(mx, null)
    const layoutIdx = indexPlaceholders(lx, masterIdx)
    const txStyles = kid(mx, 'txStyles')

    const mk = (partPath: string, rels: PartCtx['rels'], ph: PhIndex | null, locked: boolean): PartCtx => ({ ctx, map, rels, partPath, ph, txStyles, locked })
    const masterPc = mk(masterPath ?? '', mRels, null, true)
    const layoutPc = mk(layoutPath ?? '', lRels, masterIdx, true)
    const slidePc = mk(slidePath, sRels, layoutIdx, false)

    const els: SlideEl[] = []
    // decorations (non placeholder) of master and layout, drawn behind
    const showMaster = attr(sx, 'showMasterSp') !== '0' && attr(lx, 'showMasterSp') !== '0'
    if (showMaster && mx) await walkTree(path(mx, 'cSld', 'spTree'), masterPc, null, els)
    if (lx) {
      await walkTree(path(lx, 'cSld', 'spTree'), layoutPc, null, els)
    }
    await walkTree(path(sx, 'cSld', 'spTree'), slidePc, null, els)

    const bg =
      (await backgroundOf(path(sx, 'cSld', 'bg'), slidePc)) ??
      (await backgroundOf(path(lx, 'cSld', 'bg'), layoutPc)) ??
      (await backgroundOf(path(mx, 'cSld', 'bg'), masterPc)) ?? { color: '#' + ctx.scheme[map.bg1 ?? 'lt1']! }

    if (sx.getElementsByTagName('mc:AlternateContent').length || [...sx.getElementsByTagName('*')].some((n) => n.localName === 'chart' || n.localName === 'relIds')) sawUnsupported = true
    slides.push({ id: uid(), bg: bg.color ?? '#ffffff', bgImage: bg.image, elements: els })
  }

  if (sawUnsupported) warnings.push('unsupported')
  const title = (file instanceof File ? file.name : 'Presentation').replace(/\.pptx?$/i, '')
  return { deck: { title, w, h, slides: slides.length ? slides : [{ id: uid(), bg: '#ffffff', elements: [] }] }, warnings }
}

