import { DEFAULT_FONT, PX_PER_PT, type Align, type Bullet, type Para, type Run, type ShapeEl } from './model'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const fontStack = (f: string) => `'${f.replace(/'/g, '')}', 'Segoe UI', Arial, sans-serif`

/** HTML of a text body, shared by the static view and the editable view so both look identical. */
export function parasToHtml(paras: Para[], base: ShapeEl['base']): string {
  const list = paras.length ? paras : [{ runs: [] }]
  return list
    .map((p) => {
      const style: string[] = []
      style.push(`font-size:${((p.runs[0]?.size ?? base.size) * PX_PER_PT).toFixed(2)}px`)
      if (p.align) style.push(`text-align:${p.align}`)
      if (p.lineSpacing && p.lineSpacing !== 1.2) style.push(`line-height:${p.lineSpacing}`)
      if (p.level) style.push(`margin-left:${p.level * 1.5}em`)
      const attrs = [`style="${style.join(';')}"`]
      if (p.bullet && p.bullet !== 'none') attrs.push(`data-b="${p.bullet}"`)
      if (p.level) attrs.push(`data-l="${p.level}"`)
      const inner = p.runs.length
        ? p.runs
            .map((r) => {
              const s: string[] = []
              const size = r.size ?? base.size
              s.push(`font-size:${(size * PX_PER_PT).toFixed(2)}px`)
              s.push(`font-family:${fontStack(r.font ?? base.font)}`)
              s.push(`color:${r.color ?? base.color}`)
              if (r.bold) s.push('font-weight:700')
              if (r.italic) s.push('font-style:italic')
              const deco = [r.underline ? 'underline' : '', r.strike ? 'line-through' : ''].filter(Boolean).join(' ')
              if (deco) s.push(`text-decoration:${deco}`)
              if (r.highlight) s.push(`background-color:${r.highlight}`)
              return `<span style="${s.join(';')}">${esc(r.text).replace(/\n/g, '<br>')}</span>`
            })
            .join('')
        : '<br>'
      return `<div ${attrs.join(' ')}>${inner}</div>`
    })
    .join('')
}

export function toHex(c: string): string | undefined {
  if (!c) return undefined
  const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/)
  if (m && m[4] !== undefined && Number(m[4]) === 0) return undefined
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  if (c.startsWith('#')) return c.length === 4 ? '#' + [...c.slice(1)].map((d) => d + d).join('') : c.toLowerCase()
  return undefined
}

function firstFont(f: string): string | undefined {
  const first = f.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '')
  return first || undefined
}

function sameStyle(a: Run, b: Run) {
  return (
    !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline &&
    !!a.strike === !!b.strike && a.color === b.color && a.size === b.size && a.font === b.font &&
    a.highlight === b.highlight
  )
}

function collectRuns(node: Node, inherited: Run, out: Run[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (text) out.push({ ...inherited, text })
    return
  }
  if (!(node instanceof HTMLElement)) return
  if (node.tagName === 'BR') {
    out.push({ ...inherited, text: '\n' })
    return
  }
  const r: Run = { ...inherited, text: '' }
  const tag = node.tagName
  if (tag === 'B' || tag === 'STRONG') r.bold = true
  if (tag === 'I' || tag === 'EM') r.italic = true
  if (tag === 'U') r.underline = true
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') r.strike = true
  if (tag === 'FONT') {
    const c = node.getAttribute('color')
    if (c) r.color = toHex(c) ?? c
    const f = node.getAttribute('face')
    if (f) r.font = f
  }
  const s = node.style
  if (s.fontWeight) r.bold = s.fontWeight === 'bold' || Number(s.fontWeight) >= 600
  if (s.fontStyle) r.italic = s.fontStyle === 'italic'
  const deco = s.textDecorationLine || s.textDecoration
  if (deco) {
    r.underline = deco.includes('underline')
    r.strike = deco.includes('line-through')
  }
  if (s.color) r.color = toHex(s.color) ?? r.color
  if (s.fontFamily) r.font = firstFont(s.fontFamily) ?? r.font
  if (s.fontSize.endsWith('px')) r.size = Math.round((parseFloat(s.fontSize) / PX_PER_PT) * 10) / 10
  if (s.fontSize.endsWith('pt')) r.size = parseFloat(s.fontSize)
  if (s.backgroundColor) r.highlight = toHex(s.backgroundColor)
  node.childNodes.forEach((c) => collectRuns(c, r, out))
}

/** Reads the edited DOM back into the paragraph / run model. */
export function domToParas(root: HTMLElement): Para[] {
  const paras: Para[] = []
  const blocks: Node[] = []
  let loose: Node[] = []
  const flush = () => {
    if (loose.length) {
      const d = document.createElement('div')
      loose.forEach((n) => d.appendChild(n.cloneNode(true)))
      blocks.push(d)
      loose = []
    }
  }
  root.childNodes.forEach((n) => {
    if (n instanceof HTMLElement && (n.tagName === 'DIV' || n.tagName === 'P')) {
      flush()
      blocks.push(n)
    } else loose.push(n)
  })
  flush()

  for (const b of blocks) {
    const el = b as HTMLElement
    const runs: Run[] = []
    el.childNodes.forEach((c) => collectRuns(c, { text: '' }, runs))
    // a lone <br> is just an empty line
    const cleaned = runs.length === 1 && runs[0]!.text === '\n' ? [] : runs.filter((r) => r.text !== '')
    const merged: Run[] = []
    for (const r of cleaned) {
      const last = merged[merged.length - 1]
      if (last && sameStyle(last, r)) last.text += r.text
      else merged.push({ ...r })
    }
    // trailing placeholder <br> that browsers add after the last text
    const tail = merged[merged.length - 1]
    if (tail && tail.text.endsWith('\n') && el.lastChild instanceof HTMLBRElement) tail.text = tail.text.slice(0, -1)
    const p: Para = { runs: merged.filter((r) => r.text !== '') }
    const ta = el.style.textAlign as Align
    if (ta) p.align = ta === ('start' as string) ? 'left' : ta
    const bu = el.dataset.b as Bullet | undefined
    if (bu) p.bullet = bu
    if (el.dataset.l) p.level = Number(el.dataset.l)
    if (el.style.lineHeight && Number(el.style.lineHeight)) p.lineSpacing = Number(el.style.lineHeight)
    paras.push(p)
  }
  return paras.length ? paras : [{ runs: [] }]
}

/** Plain text of paragraphs (used for search / empty detection) */
export const parasText = (paras: Para[]) => paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n')

export function mapRuns(paras: Para[], fn: (r: Run) => Run): Para[] {
  return paras.map((p) => ({ ...p, runs: p.runs.map(fn) }))
}

export interface Format {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  font: string
  size: number
  color: string
}

/** Format of the first run (model level, used when no text is being edited) */
export function formatOfEl(el: ShapeEl): Format {
  const r = el.paras.find((p) => p.runs.length)?.runs[0]
  return {
    bold: !!r?.bold,
    italic: !!r?.italic,
    underline: !!r?.underline,
    strike: !!r?.strike,
    font: r?.font ?? el.base.font,
    size: r?.size ?? el.base.size,
    color: r?.color ?? el.base.color,
  }
}

/** Format at the caret / selection of an element being edited */
export function formatAtSelection(root: HTMLElement): Format | null {
  const sel = window.getSelection()
  if (!sel || !sel.anchorNode || !root.contains(sel.anchorNode)) return null
  const node = sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode.parentElement
  if (!node) return null
  const cs = getComputedStyle(node)
  const deco = cs.textDecorationLine
  return {
    bold: Number(cs.fontWeight) >= 600 || cs.fontWeight === 'bold',
    italic: cs.fontStyle === 'italic',
    underline: deco.includes('underline'),
    strike: deco.includes('line-through'),
    font: firstFont(cs.fontFamily) ?? DEFAULT_FONT,
    size: Math.round((parseFloat(cs.fontSize) / PX_PER_PT) * 10) / 10,
    color: toHex(cs.color) ?? '#000000',
  }
}

// ── Commands on the live editor (contentEditable) ────────────────────────────

export function exec(cmd: string, value?: string) {
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand(cmd, false, value)
}

/** Sets a font size in points on the current selection (execCommand only knows 1-7). */
export function execFontSize(root: HTMLElement, pt: number) {
  exec('fontSize', '7')
  root.querySelectorAll<HTMLElement>('font[size="7"], [style*="xxx-large"]').forEach((el) => {
    el.removeAttribute('size')
    el.style.fontSize = `${(pt * PX_PER_PT).toFixed(2)}px`
  })
}

/** Direct block children of the editor that the selection touches */
export function selectedBlocks(root: HTMLElement): HTMLElement[] {
  const sel = window.getSelection()
  const blocks = [...root.children].filter((c): c is HTMLElement => c instanceof HTMLElement)
  if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return blocks
  const range = sel.getRangeAt(0)
  const hit = blocks.filter((b) => range.intersectsNode(b))
  return hit.length ? hit : blocks
}
