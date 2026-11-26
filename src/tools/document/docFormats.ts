import mammoth from 'mammoth'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx'

export type DocFormat = 'docx' | 'txt' | 'md' | 'html' | 'rtf'

export const ACCEPTED_DOCUMENT_EXTENSIONS =
  '.docx,.txt,.md,.markdown,.html,.htm,.rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/html,application/rtf'

export function detectDocFormat(fileName: string): DocFormat {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.rtf')) return 'rtf'
  return 'txt'
}

export function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx > 0 ? fileName.slice(0, idx) : fileName
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Sanitizes imported HTML by stripping scripts, styles, and event handler attributes. */
function sanitizeHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
  for (const el of doc.querySelectorAll('script, style, iframe, object, embed')) {
    el.remove()
  }
  for (const el of doc.body.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name)
      }
    }
  }
  return doc.body.innerHTML || '<p></p>'
}

/** Converts basic Markdown into clean HTML for the rich text editor. */
function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false
  let inCode = false
  let codeBuf: string[] = []

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>')
      inUl = false
    }
    if (inOl) {
      out.push('</ol>')
      inOl = false
    }
  }

  const formatInline = (line: string): string => {
    let s = escapeHtml(line)
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>')
    s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>')
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    return s
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeLists()
      if (inCode) {
        out.push(`<pre>${escapeHtml(codeBuf.join('\n'))}</pre>`)
        codeBuf = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      closeLists()
      const level = (heading[1] ?? '#').length
      out.push(`<h${level}>${formatInline(heading[2] ?? '')}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeLists()
      out.push('<hr />')
      continue
    }

    const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/)
    if (ulMatch) {
      if (inOl) {
        out.push('</ol>')
        inOl = false
      }
      if (!inUl) {
        out.push('<ul>')
        inUl = true
      }
      out.push(`<li>${formatInline(ulMatch[1] ?? '')}</li>`)
      continue
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/)
    if (olMatch) {
      if (inUl) {
        out.push('</ul>')
        inUl = false
      }
      if (!inOl) {
        out.push('<ol>')
        inOl = true
      }
      out.push(`<li>${formatInline(olMatch[1] ?? '')}</li>`)
      continue
    }

    const quoteMatch = line.match(/^>\s?(.*)$/)
    if (quoteMatch) {
      closeLists()
      out.push(`<blockquote><p>${formatInline(quoteMatch[1] ?? '')}</p></blockquote>`)
      continue
    }

    closeLists()
    if (line.trim() === '') {
      out.push('<p><br /></p>')
    } else {
      out.push(`<p>${formatInline(line)}</p>`)
    }
  }
  closeLists()
  if (inCode) out.push(`<pre>${escapeHtml(codeBuf.join('\n'))}</pre>`)

  return out.join('') || '<p></p>'
}

/** Extracts readable paragraphs from an RTF file. */
function rtfToHtml(rtf: string): string {
  // Remove header groups like {\fonttbl...}, {\colortbl...}, {\stylesheet...}, {\info...}
  let text = rtf
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|object)[^}]*(?:\{[^}]*\}[^}]*)*\}/g, '')
    .replace(/\\par\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, code: string) => {
      const n = parseInt(code, 10)
      return String.fromCharCode(n < 0 ? n + 65536 : n)
    })
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replace(/[{}]/g, '')
    .trim()

  if (!text) return '<p></p>'
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br /></p>'))
    .join('')
}

function plainTextToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.length === 0) return '<p></p>'
  return lines
    .map((line) => (line.length > 0 ? `<p>${escapeHtml(line)}</p>` : '<p><br /></p>'))
    .join('')
}

/** Reads a local document file (.docx, .txt, .md, .html, .rtf) into editable HTML. */
export async function importDocumentFile(file: File): Promise<{
  html: string
  name: string
  format: DocFormat
}> {
  const format = detectDocFormat(file.name)

  if (format === 'docx') {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.convertToHtml({ arrayBuffer })
    return {
      html: sanitizeHtml(result.value) || '<p></p>',
      name: file.name,
      format,
    }
  }

  const text = await file.text()
  let html: string
  switch (format) {
    case 'html':
      html = sanitizeHtml(text)
      break
    case 'md':
      html = markdownToHtml(text)
      break
    case 'rtf':
      html = rtfToHtml(text)
      break
    case 'txt':
    default:
      html = plainTextToHtml(text)
      break
  }

  return { html, name: file.name, format }
}

// ── Export helpers ─────────────────────────────────────────────────────────────

function cssColorToHex(color: string): string | undefined {
  if (!color) return undefined
  const trimmed = color.trim()
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1)
    if (hex.length === 3) {
      return hex
        .split('')
        .map((c) => c + c)
        .join('')
        .toUpperCase()
    }
    if (hex.length === 6) return hex.toUpperCase()
  }
  const rgb = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgb) {
    const toHex = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')
    return `${toHex(rgb[1] ?? '0')}${toHex(rgb[2] ?? '0')}${toHex(rgb[3] ?? '0')}`.toUpperCase()
  }
  return undefined
}

function getAlignment(el: HTMLElement): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  const align = el.style.textAlign || el.getAttribute('align') || ''
  switch (align.toLowerCase()) {
    case 'center':
      return AlignmentType.CENTER
    case 'right':
      return AlignmentType.RIGHT
    case 'justify':
      return AlignmentType.JUSTIFIED
    case 'left':
      return AlignmentType.LEFT
    default:
      return undefined
  }
}

interface InlineStyle {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  size?: number
  font?: string
}

function dataUrlToUint8Array(dataUrl: string): { bytes: Uint8Array; type: 'png' | 'jpg' | 'gif' } | null {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/i)
  if (!match || !match[1] || !match[2]) return null
  const rawType = match[1].toLowerCase()
  const type: 'png' | 'jpg' | 'gif' =
    rawType === 'jpeg' || rawType === 'jpg' ? 'jpg' : rawType === 'gif' ? 'gif' : 'png'
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { bytes, type }
}

function collectInlineRuns(node: Node, inherited: InlineStyle = {}): (TextRun | ImageRun)[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!text) return []
    return [
      new TextRun({
        text,
        bold: inherited.bold,
        italics: inherited.italics,
        underline: inherited.underline ? { type: UnderlineType.SINGLE } : undefined,
        strike: inherited.strike,
        color: inherited.color,
        size: inherited.size,
        font: inherited.font,
      }),
    ]
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const el = node as HTMLElement
  const tag = el.tagName.toUpperCase()

  if (tag === 'BR') {
    return [new TextRun({ break: 1 })]
  }

  if (tag === 'IMG') {
    const imgEl = el as HTMLImageElement
    const src = imgEl.getAttribute('src') ?? ''
    const decoded = dataUrlToUint8Array(src)
    if (!decoded) return []
    const w = Math.min(520, Math.max(40, imgEl.width || Number(imgEl.getAttribute('width')) || 320))
    const h = Math.min(680, Math.max(40, imgEl.height || Number(imgEl.getAttribute('height')) || 220))
    return [
      new ImageRun({
        data: decoded.bytes,
        transformation: { width: w, height: h },
        type: decoded.type,
      }),
    ]
  }

  const next: InlineStyle = { ...inherited }
  if (tag === 'B' || tag === 'STRONG') next.bold = true
  if (tag === 'I' || tag === 'EM') next.italics = true
  if (tag === 'U') next.underline = true
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true
  if (tag === 'CODE') next.font = 'Courier New'

  if (el.style.fontWeight === 'bold' || Number(el.style.fontWeight) >= 600) next.bold = true
  if (el.style.fontStyle === 'italic') next.italics = true
  if (el.style.textDecoration.includes('underline')) next.underline = true
  if (el.style.textDecoration.includes('line-through')) next.strike = true
  if (el.style.color) {
    const hex = cssColorToHex(el.style.color)
    if (hex) next.color = hex
  }
  if (el.style.fontFamily) {
    const firstFont = el.style.fontFamily.split(',')[0]
    if (firstFont) next.font = firstFont.replace(/['"]/g, '').trim()
  }
  if (el.style.fontSize) {
    const px = parseFloat(el.style.fontSize)
    if (!Number.isNaN(px) && px > 0) {
      // docx uses half-points (1pt = 2 half-points, 1px ≈ 0.75pt => ~1.5 half-points)
      next.size = Math.round(px * 1.5)
    }
  }

  const runs: (TextRun | ImageRun)[] = []
  for (const child of el.childNodes) {
    runs.push(...collectInlineRuns(child, next))
  }
  return runs
}

const HEADING_MAP: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
  H5: HeadingLevel.HEADING_5,
  H6: HeadingLevel.HEADING_6,
}

function elementToDocxBlocks(el: HTMLElement): (Paragraph | Table)[] {
  const tag = el.tagName.toUpperCase()
  const alignment = getAlignment(el)

  if (tag in HEADING_MAP) {
    return [
      new Paragraph({
        heading: HEADING_MAP[tag],
        alignment,
        children: collectInlineRuns(el),
      }),
    ]
  }

  if (tag === 'HR') {
    return [
      new Paragraph({
        border: {
          bottom: { color: 'CBD5E1', space: 1, style: BorderStyle.SINGLE, size: 6 },
        },
        children: [],
      }),
    ]
  }

  if (tag === 'UL' || tag === 'OL') {
    const items: Paragraph[] = []
    for (const child of el.children) {
      if (child.tagName.toUpperCase() === 'LI') {
        const liEl = child as HTMLElement
        items.push(
          new Paragraph({
            alignment: getAlignment(liEl),
            bullet: tag === 'UL' ? { level: 0 } : undefined,
            numbering: tag === 'OL' ? { reference: 'edavio-numbered', level: 0 } : undefined,
            children: collectInlineRuns(liEl),
          }),
        )
      }
    }
    return items
  }

  if (tag === 'BLOCKQUOTE') {
    return [
      new Paragraph({
        indent: { left: 720 },
        border: {
          left: { color: '6366F1', space: 12, style: BorderStyle.SINGLE, size: 12 },
        },
        children: collectInlineRuns(el, { italics: true, color: '52525B' }),
      }),
    ]
  }

  if (tag === 'PRE') {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: el.textContent ?? '',
            font: 'Courier New',
            size: 20,
          }),
        ],
      }),
    ]
  }

  if (tag === 'TABLE') {
    const rows: TableRow[] = []
    for (const tr of el.querySelectorAll('tr')) {
      const cells: TableCell[] = []
      for (const cell of tr.querySelectorAll('th, td')) {
        const cellEl = cell as HTMLElement
        const isHeader = cellEl.tagName.toUpperCase() === 'TH'
        cells.push(
          new TableCell({
            children: [
              new Paragraph({
                alignment: getAlignment(cellEl),
                children: collectInlineRuns(cellEl, isHeader ? { bold: true } : {}),
              }),
            ],
          }),
        )
      }
      if (cells.length > 0) rows.push(new TableRow({ children: cells }))
    }
    if (rows.length === 0) return []
    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
      }),
    ]
  }

  if (tag === 'P' || tag === 'DIV') {
    // If a DIV contains nested block elements, recurse instead of flattening
    const hasNestedBlocks = [...el.children].some((c) =>
      ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE'].includes(
        c.tagName.toUpperCase(),
      ),
    )
    if (tag === 'DIV' && hasNestedBlocks) {
      const blocks: (Paragraph | Table)[] = []
      for (const child of el.children) {
        blocks.push(...elementToDocxBlocks(child as HTMLElement))
      }
      return blocks
    }
    return [
      new Paragraph({
        alignment,
        children: collectInlineRuns(el),
      }),
    ]
  }

  return [
    new Paragraph({
      alignment,
      children: collectInlineRuns(el),
    }),
  ]
}

/** Exports editor HTML into a valid .docx Blob. */
export async function exportDocumentAsDocx(html: string, title: string): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const children: (Paragraph | Table)[] = []

  for (const node of parsed.body.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) children.push(new Paragraph({ children: [new TextRun(text)] }))
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      children.push(...elementToDocxBlocks(node as HTMLElement))
    }
  }

  if (children.length === 0) {
    children.push(new Paragraph({ children: [] }))
  }

  const doc = new Document({
    title,
    numbering: {
      config: [
        {
          reference: 'edavio-numbered',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  })

  return Packer.toBlob(doc)
}

export function exportDocumentAsHtml(html: string, title: string): Blob {
  const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 24px; line-height: 1.6; color: #18181b; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #d4d4d8; padding: 8px 10px; text-align: left; }
  blockquote { border-left: 3px solid #4f46e5; margin: 16px 0; padding-left: 14px; color: #52525b; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${html}
</body>
</html>`
  return new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
}

function htmlNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  const tag = el.tagName.toUpperCase()
  const inner = [...el.childNodes].map(htmlNodeToMarkdown).join('')

  switch (tag) {
    case 'H1':
      return `# ${inner.trim()}\n\n`
    case 'H2':
      return `## ${inner.trim()}\n\n`
    case 'H3':
      return `### ${inner.trim()}\n\n`
    case 'H4':
      return `#### ${inner.trim()}\n\n`
    case 'STRONG':
    case 'B':
      return `**${inner}**`
    case 'EM':
    case 'I':
      return `*${inner}*`
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return `~~${inner}~~`
    case 'CODE':
      return `\`${inner}\``
    case 'PRE':
      return `\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n\n`
    case 'BLOCKQUOTE':
      return `${inner
        .trim()
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')}\n\n`
    case 'UL':
      return `${[...el.children].map((li) => `- ${htmlNodeToMarkdown(li).trim()}`).join('\n')}\n\n`
    case 'OL':
      return `${[...el.children].map((li, i) => `${i + 1}. ${htmlNodeToMarkdown(li).trim()}`).join('\n')}\n\n`
    case 'LI':
      return inner
    case 'A':
      return `[${inner}](${el.getAttribute('href') ?? ''})`
    case 'HR':
      return '---\n\n'
    case 'BR':
      return '\n'
    case 'P':
    case 'DIV':
      return `${inner.trim()}\n\n`
    default:
      return inner
  }
}

export function exportDocumentAsMarkdown(html: string): Blob {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const md = [...parsed.body.childNodes].map(htmlNodeToMarkdown).join('').replace(/\n{3,}/g, '\n\n').trim()
  return new Blob([md], { type: 'text/markdown;charset=utf-8' })
}

export function exportDocumentAsTxt(html: string): Blob {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const lines: string[] = []
  for (const child of parsed.body.childNodes) {
    const txt = (child.textContent ?? '').trim()
    if (txt) lines.push(txt)
  }
  return new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' })
}
