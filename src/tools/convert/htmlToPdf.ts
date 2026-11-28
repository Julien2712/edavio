import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

const W = 595.28, H = 841.89, M = 56
type Align = 'left' | 'center' | 'right' | 'justify'
interface Run { text: string; bold?: boolean; italic?: boolean; mono?: boolean; size: number; color: [number, number, number]; underline?: boolean }

const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/€/g, 'EUR').replace(/ /g, ' ').replace(/[^\x09\x20-\x7e\xa1-\xff]/g, '?')
const parseColor = (c: string | null | undefined): [number, number, number] | null => {
  const m = c?.match(/#([0-9a-f]{6})/i) ?? null
  if (m) { const n = parseInt(m[1]!, 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] }
  const r = c?.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/); return r ? [+r[1]! / 255, +r[2]! / 255, +r[3]! / 255] : null
}

/** Renders HTML (headings, paragraphs, lists, tables, images, bold/italic/underline/colors) to an A4 PDF. */
export async function htmlToPdf(html: string, title: string): Promise<Blob> {
  const pdf = await PDFDocument.create()
  const fonts = {
    r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold),
    i: await pdf.embedFont(StandardFonts.HelveticaOblique), bi: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    m: await pdf.embedFont(StandardFonts.Courier),
  }
  const pick = (r: Run): PDFFont => (r.mono ? fonts.m : r.bold && r.italic ? fonts.bi : r.bold ? fonts.b : r.italic ? fonts.i : fonts.r)
  let page: PDFPage = pdf.addPage([W, H])
  let y = H - M
  const ensure = (h: number) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M } }

  type Word = { text: string; run: Run; w: number }
  const layout = (runs: Run[], width: number): Word[][] => {
    const lines: Word[][] = [[]]
    let x = 0
    for (const run of runs) {
      const f = pick(run)
      for (const part of clean(run.text).split(/(\s+)/)) {
        if (!part) continue
        if (part === '\n' || /\n/.test(part)) { lines.push([]); x = 0; continue }
        const w = f.widthOfTextAtSize(part, run.size)
        const cur = lines[lines.length - 1]!
        if (/^\s+$/.test(part)) { if (cur.length) { cur.push({ text: ' ', run, w }); x += w } continue }
        if (x + w > width && cur.length) { while (cur.length && cur[cur.length - 1]!.text === ' ') { x -= cur.pop()!.w } lines.push([]); x = 0 }
        lines[lines.length - 1]!.push({ text: part, run, w }); x += w
      }
    }
    return lines.filter((l) => l.length)
  }
  const drawLines = (lines: Word[][], x0: number, width: number, align: Align, boxed = false) => {
    for (const line of lines) {
      const size = Math.max(...line.map((w) => w.run.size)), lh = size * 1.35
      ensure(lh)
      const tw = line.reduce((a, w) => a + w.w, 0)
      let x = x0 + (align === 'center' ? (width - tw) / 2 : align === 'right' ? width - tw : 0)
      if (boxed) page.drawRectangle({ x: x0 - 4, y: y - lh + size * 0.3, width: width + 8, height: lh, color: rgb(0.95, 0.95, 0.96) })
      for (const w of line) {
        page.drawText(w.text, { x, y: y - size, size: w.run.size, font: pick(w.run), color: rgb(...w.run.color) })
        if (w.run.underline && w.text !== ' ') page.drawLine({ start: { x, y: y - size - 1.5 }, end: { x: x + w.w, y: y - size - 1.5 }, thickness: 0.6, color: rgb(...w.run.color) })
        x += w.w
      }
      y -= lh
    }
  }

  const base = (): Run => ({ text: '', size: 11, color: [0.1, 0.1, 0.1] })
  const inline = (node: Node, st: Run, out: Run[]) => {
    if (node.nodeType === 3) { out.push({ ...st, text: node.textContent!.replace(/\s+/g, ' ') }); return }
    if (node.nodeType !== 1) return
    const el = node as HTMLElement, tag = el.tagName.toLowerCase()
    if (tag === 'br') { out.push({ ...st, text: '\n' }); return }
    if (tag === 'img' || ['ul', 'ol', 'table'].includes(tag)) return
    const s = { ...st }
    if (tag === 'b' || tag === 'strong' || /^h[1-6]$/.test(tag)) s.bold = true
    if (tag === 'i' || tag === 'em') s.italic = true
    if (tag === 'u' || tag === 'a') s.underline = true
    if (tag === 'code' || tag === 'pre') s.mono = true
    const st2 = el.style
    if (st2.fontWeight === 'bold' || +st2.fontWeight >= 600) s.bold = true
    if (st2.fontStyle === 'italic') s.italic = true
    if (st2.textDecoration.includes('underline')) s.underline = true
    const col = parseColor(st2.color || el.getAttribute('color')); if (col) s.color = col
    const fs = parseFloat(st2.fontSize); if (fs) s.size = fs * (st2.fontSize.endsWith('pt') ? 1 : 0.75)
    el.childNodes.forEach((c) => inline(c, s, out))
  }
  const alignOf = (el: HTMLElement): Align => (['center', 'right', 'justify'].includes(el.style.textAlign) ? (el.style.textAlign as Align) : 'left')

  const image = async (el: HTMLImageElement, x: number, maxW: number) => {
    const src = el.getAttribute('src') ?? ''
    if (!src.startsWith('data:')) return
    let img: PDFImage
    try {
      const bytes = Uint8Array.from(atob(src.split(',')[1]!), (c) => c.charCodeAt(0))
      img = /png/.test(src.slice(0, 20)) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    } catch {
      try {
        const im = new Image(); im.src = src; await im.decode()
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d')!.drawImage(im, 0, 0)
        img = await pdf.embedPng(Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]!), (ch) => ch.charCodeAt(0)))
      } catch { return }
    }
    const k = Math.min(1, maxW / img.width, (H - 2 * M) / img.height)
    const w = img.width * k, h = img.height * k
    ensure(h + 6)
    page.drawImage(img, { x, y: y - h, width: w, height: h })
    y -= h + 6
  }

  const block = async (el: Element, x: number, width: number, st: Run): Promise<void> => {
    const tag = el.tagName.toLowerCase()
    const h = el as HTMLElement
    if (/^h[1-6]$/.test(tag)) {
      const size = [24, 20, 16, 14, 12, 11][+tag[1]! - 1]!
      const runs: Run[] = []; inline(el, { ...st, size, bold: true }, runs)
      y -= size * 0.5; drawLines(layout(runs, width), x, width, alignOf(h)); y -= size * 0.3; return
    }
    if (tag === 'ul' || tag === 'ol') {
      let n = 0
      for (const li of el.children) {
        if (li.tagName.toLowerCase() !== 'li') continue
        n++
        const runs: Run[] = []; li.childNodes.forEach((c) => inline(c, st, runs))
        const marker = tag === 'ul' ? '•' : `${n}.`
        const mark: Run = { ...st, text: marker }
        ensure(st.size * 1.4)
        const yy = y
        if (tag === 'ul') page.drawCircle({ x: x + 6, y: yy - st.size * 0.65, size: 1.8, color: rgb(...st.color) })
        else page.drawText(clean(marker), { x, y: yy - st.size, size: st.size, font: pick(mark), color: rgb(...st.color) })
        drawLines(layout(runs, width - 20), x + 20, width - 20, 'left')
        for (const sub of li.children) if (['ul', 'ol'].includes(sub.tagName.toLowerCase())) await block(sub, x + 20, width - 20, st)
        y -= 2
      }
      y -= 4; return
    }
    if (tag === 'table') {
      const rows = [...el.querySelectorAll('tr')]
      for (const tr of rows) {
        const cells = [...tr.children] as HTMLElement[]
        const cw = width / Math.max(1, cells.length)
        const laid = cells.map((c) => { const runs: Run[] = []; inline(c, { ...st, size: 10, bold: c.tagName.toLowerCase() === 'th' }, runs); return layout(runs, cw - 8) })
        const rh = Math.max(...laid.map((l) => l.reduce((a, ln) => a + Math.max(...ln.map((w) => w.run.size)) * 1.35, 0)), 14) + 6
        ensure(rh)
        const top = y
        cells.forEach((_, i) => {
          page.drawRectangle({ x: x + i * cw, y: top - rh, width: cw, height: rh, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 })
          const save = y; y = top - 3; drawLines(laid[i]!, x + i * cw + 4, cw - 8, 'left'); y = save
        })
        y = top - rh
      }
      y -= 8; return
    }
    if (tag === 'img') { await image(h as HTMLImageElement, x, width); return }
    if (tag === 'hr') { ensure(10); page.drawLine({ start: { x, y: y - 4 }, end: { x: x + width, y: y - 4 }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) }); y -= 10; return }
    if (tag === 'blockquote') {
      const y0 = y; for (const c of el.children) await block(c, x + 16, width - 16, { ...st, color: [0.35, 0.35, 0.4], italic: true })
      page.drawLine({ start: { x: x + 4, y: y0 }, end: { x: x + 4, y }, thickness: 2, color: rgb(0.75, 0.75, 0.8) }); return
    }
    if (tag === 'pre') { const runs: Run[] = []; inline(el, { ...st, mono: true, size: 9.5, text: '' }, runs); const t = el.textContent ?? ''; drawLines(layout([{ ...st, mono: true, size: 9.5, text: t }], width - 8).map((l) => l), x + 4, width - 8, 'left', true); y -= 6; return }
    // paragraph-like container: images/lists/tables nested inside are handled as blocks, text as flowing runs
    const hasBlocks = [...el.children].some((c) => ['p', 'div', 'ul', 'ol', 'table', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr'].includes(c.tagName.toLowerCase()))
    if (hasBlocks && ['div', 'body', 'section', 'article'].includes(tag)) { for (const c of el.childNodes) { if (c.nodeType === 1) await block(c as Element, x, width, st); else if (c.textContent?.trim()) { const r: Run[] = []; inline(c, st, r); drawLines(layout(r, width), x, width, 'left'); y -= 4 } } return }
    const runs: Run[] = []; inline(el, st, runs)
    const imgs = [...el.querySelectorAll('img')]
    if (runs.some((r) => r.text.trim())) { drawLines(layout(runs, width), x, width, alignOf(h)); y -= 6 } else if (!imgs.length) y -= st.size * 0.8
    for (const im of imgs) await image(im, x, width)
  }

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  await block(doc.body, M, W - 2 * M, base())
  pdf.setTitle(title); pdf.setCreator('Edavio')
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' })
}
