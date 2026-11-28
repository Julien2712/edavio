import { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { ChevronLeft, ChevronRight, List, Minus, Plus } from 'lucide-react'
import { Bar, CloseBtn, ReaderFrame, Sep, TB, useR } from './ui'

interface Book { name: string; kind: 'epub' | 'cbz'; chapters: { title: string; html: string }[]; pages: string[]; title: string }

const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/') + 1)
const resolve = (base: string, rel: string) => { const out = (base + decodeURIComponent(rel.split('#')[0]!)).split('/'); const st: string[] = []; for (const s of out) { if (s === '..') st.pop(); else if (s !== '.') st.push(s) } return st.join('/') }

async function load([f]: File[]): Promise<Book> {
  const zip = await JSZip.loadAsync(await f!.arrayBuffer())
  if (/\.cbz$/i.test(f!.name)) {
    const names = Object.keys(zip.files).filter((n) => /\.(jpe?g|png|webp|gif)$/i.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const pages = await Promise.all(names.map(async (n) => URL.createObjectURL(await zip.file(n)!.async('blob'))))
    return { name: f!.name, kind: 'cbz', chapters: [], pages, title: f!.name }
  }
  const dom = (s: string, t: DOMParserSupportedType = 'application/xml') => new DOMParser().parseFromString(s, t)
  const container = dom(await zip.file('META-INF/container.xml')!.async('string'))
  const opfPath = container.querySelector('rootfile')!.getAttribute('full-path')!
  const opf = dom(await zip.file(opfPath)!.async('string'))
  const base = dirOf(opfPath)
  const manifest = new Map([...opf.querySelectorAll('manifest > item')].map((i) => [i.getAttribute('id')!, { href: resolve(base, i.getAttribute('href')!), type: i.getAttribute('media-type') ?? '' }]))
  const title = opf.querySelector('metadata > *|title, title')?.textContent ?? f!.name
  // assets inlined as data URLs so chapters render in a sandboxed iframe
  const cache = new Map<string, string>()
  const asset = async (path: string) => { if (cache.has(path)) return cache.get(path)!; const file = zip.file(path); if (!file) return ''; const ext = path.split('.').pop()!.toLowerCase(); const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', css: 'text/css' } as Record<string, string>)[ext] ?? 'application/octet-stream'; const u = `data:${mime};base64,${await file.async('base64')}`; cache.set(path, u); return u }
  const chapters: Book['chapters'] = []
  for (const ref of opf.querySelectorAll('spine > itemref')) {
    const m = manifest.get(ref.getAttribute('idref')!)
    if (!m || !/html/.test(m.type)) continue
    const raw = await zip.file(m.href)?.async('string')
    if (!raw) continue
    const doc = dom(raw, 'text/html')
    const cdir = dirOf(m.href)
    for (const img of doc.querySelectorAll('img, image')) { const attr = img.hasAttribute('src') ? 'src' : 'xlink:href'; const s = img.getAttribute(attr); if (s && !/^data:|^https?:/.test(s)) img.setAttribute(img.hasAttribute('src') ? 'src' : 'href', await asset(resolve(cdir, s))) }
    for (const l of [...doc.querySelectorAll('link[rel=stylesheet]')]) { const href = l.getAttribute('href'); const css = href ? await zip.file(resolve(cdir, href))?.async('string') : ''; const st = doc.createElement('style'); st.textContent = css ?? ''; l.replaceWith(st) }
    doc.querySelectorAll('script').forEach((s) => s.remove())
    const t = doc.querySelector('h1, h2, h3, title')?.textContent?.trim() || `${chapters.length + 1}`
    chapters.push({ title: t, html: doc.body.innerHTML + [...doc.querySelectorAll('style')].map((s) => s.outerHTML).join('') })
  }
  if (!chapters.length) throw new Error('empty')
  return { name: f!.name, kind: 'epub', chapters, pages: [], title }
}

export default function EbookReaderPage() {
  const r = useR()
  return (
    <ReaderFrame toolId="ebook-reader" formats={['EPUB', 'CBZ']} re={/\.(epub|cbz)$/i} hint={r('ebookHint')} load={load}>
      {(b, close) => <Viewer b={b} close={close} />}
    </ReaderFrame>
  )
}

const THEMES = { light: ['#ffffff', '#1f2937'], sepia: ['#f4ecd8', '#5b4636'], dark: ['#1a1a1a', '#d4d4d4'] } as const

function Viewer({ b, close }: { b: Book; close: () => void }) {
  const r = useR()
  const total = b.kind === 'epub' ? b.chapters.length : b.pages.length
  const [i, setI] = useState(0)
  const [size, setSize] = useState(18)
  const [theme, setTheme] = useState<keyof typeof THEMES>('light')
  const [serif, setSerif] = useState(true)
  const [toc, setToc] = useState(b.kind === 'epub')
  const [bg, fg] = THEMES[theme]
  const go = (d: number) => setI((x) => Math.min(total - 1, Math.max(0, x + d)))
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1); else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) })
  const srcDoc = useMemo(() => (b.kind === 'epub' ? `<!doctype html><meta charset=utf-8><style>body{margin:0 auto;max-width:42em;padding:32px 28px;background:${bg};color:${fg};font:${size}px/1.7 ${serif ? 'Georgia,serif' : 'system-ui,sans-serif'}}img{max-width:100%;height:auto}a{color:inherit}</style>${b.chapters[i]!.html}` : ''), [b, i, bg, fg, size, serif])
  return (
    <>
      <Bar>
        <CloseBtn onClick={close} /><Sep />
        {b.kind === 'epub' && <TB title={r('toc')} active={toc} onClick={() => setToc((x) => !x)}><List className="size-4" /></TB>}
        <TB title="prev" onClick={() => go(-1)} disabled={i === 0}><ChevronLeft className="size-4" /></TB><span className="text-xs tabular-nums">{i + 1} / {total}</span><TB title="next" onClick={() => go(1)} disabled={i === total - 1}><ChevronRight className="size-4" /></TB>
        {b.kind === 'epub' && <><Sep /><TB title={r('zoomOut')} onClick={() => setSize((s) => Math.max(12, s - 2))}><Minus className="size-4" /></TB><span className="w-8 text-center text-xs tabular-nums">{size}</span><TB title={r('zoomIn')} onClick={() => setSize((s) => Math.min(36, s + 2))}><Plus className="size-4" /></TB>
          <TB title={r('font')} active={serif} onClick={() => setSerif((x) => !x)}>Aa</TB><Sep />
          {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((k) => <TB key={k} title={r(k === 'dark' ? 'dark2' : k)} active={theme === k} onClick={() => setTheme(k)}><span className="size-3.5 rounded-full border border-[var(--color-border)]" style={{ background: THEMES[k][0] }} /></TB>)}</>}
        <span className="ml-auto max-w-[260px] truncate px-2 text-xs text-[var(--color-text-tertiary)]">{b.title}</span>
      </Bar>
      <div className="flex flex-1 overflow-hidden">
        {b.kind === 'epub' && toc && <nav className="hidden w-56 shrink-0 overflow-auto border-r border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2 sm:block">{b.chapters.map((c, k) => <button key={k} type="button" onClick={() => setI(k)} className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${k === i ? 'bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]'}`}>{c.title}</button>)}</nav>}
        {b.kind === 'epub' ? <iframe title="book" sandbox="" srcDoc={srcDoc} className="flex-1 border-0" style={{ background: bg }} /> : <div className="flex flex-1 items-center justify-center overflow-auto bg-neutral-900 p-3"><img src={b.pages[i]} alt="" className="max-h-full max-w-full object-contain" /></div>}
      </div>
    </>
  )
}
