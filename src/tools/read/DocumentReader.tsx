import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { ChevronLeft, ChevronRight, Maximize2, Minus, Moon, Plus, Search, Sun } from 'lucide-react'
import { loadPdfJs } from '../shared/util'
import { importPptx } from '../presentation/pptxImport'
import { SlideView } from '../presentation/SlideView'
import type { Deck } from '../presentation/model'
import { Bar, CloseBtn, ReaderFrame, Sep, TB, useR } from './ui'

type Doc =
  | { kind: 'pdf'; name: string; pdf: import('pdfjs-dist').PDFDocumentProxy }
  | { kind: 'html'; name: string; html: string }
  | { kind: 'sheet'; name: string; book: XLSX.WorkBook }
  | { kind: 'deck'; name: string; deck: Deck }

async function load([f]: File[]): Promise<Doc> {
  const name = f!.name
  if (/\.pdf$/i.test(name)) { const pdfjs = await loadPdfJs(); return { kind: 'pdf', name, pdf: await pdfjs.getDocument({ data: new Uint8Array(await f!.arrayBuffer()) }).promise } }
  if (/\.docx$/i.test(name)) return { kind: 'html', name, html: (await mammoth.convertToHtml({ arrayBuffer: await f!.arrayBuffer() })).value }
  if (/\.pptx$/i.test(name)) return { kind: 'deck', name, deck: (await importPptx(f!)).deck }
  return { kind: 'sheet', name, book: XLSX.read(await f!.arrayBuffer(), { type: 'array', cellDates: true }) }
}

export default function DocumentReaderPage() {
  const r = useR()
  return (
    <ReaderFrame toolId="document-reader" formats={['PDF', 'DOCX', 'XLSX', 'CSV', 'PPTX']} re={/\.(pdf|docx|pptx|xlsx|xlsm|xls|csv|ods)$/i} hint={r('docHint')} load={load}>
      {(d, close) => <Viewer doc={d} close={close} />}
    </ReaderFrame>
  )
}

function Viewer({ doc, close }: { doc: Doc; close: () => void }) {
  const r = useR()
  const [zoom, setZoom] = useState(1)
  const [dark, setDark] = useState(false)
  return (
    <>
      <Bar>
        <CloseBtn onClick={close} /><Sep />
        <span className="max-w-[200px] truncate px-1 text-xs font-medium text-[var(--color-text-primary)]">{doc.name}</span><Sep />
        {doc.kind !== 'sheet' && <><TB title={r('zoomOut')} onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}><Minus className="size-4" /></TB><span className="w-11 text-center text-xs tabular-nums">{Math.round(zoom * 100)} %</span><TB title={r('zoomIn')} onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}><Plus className="size-4" /></TB><TB title={r('fit')} onClick={() => setZoom(1)}><Maximize2 className="size-4" /></TB></>}
        <TB title={r('dark')} active={dark} onClick={() => setDark((x) => !x)}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</TB>
      </Bar>
      {doc.kind === 'pdf' && <PdfView pdf={doc.pdf} zoom={zoom} dark={dark} />}
      {doc.kind === 'html' && <div className="flex-1 overflow-auto bg-[var(--color-surface-sunken)] p-6"><article className={`doc-read mx-auto max-w-3xl rounded-sm p-12 shadow-[var(--shadow-md)] ${dark ? 'bg-neutral-900 text-neutral-200' : 'bg-white text-neutral-900'}`} style={{ zoom }} dangerouslySetInnerHTML={{ __html: doc.html }} /></div>}
      {doc.kind === 'sheet' && <SheetView book={doc.book} dark={dark} />}
      {doc.kind === 'deck' && <DeckView deck={doc.deck} zoom={zoom} dark={dark} />}
    </>
  )
}

function PdfView({ pdf, zoom, dark }: { pdf: import('pdfjs-dist').PDFDocumentProxy; zoom: number; dark: boolean }) {
  const r = useR()
  const box = useRef<HTMLDivElement>(null)
  const [cur, setCur] = useState(1)
  const [q, setQ] = useState('')
  const [texts, setTexts] = useState<string[]>([])
  const [hit, setHit] = useState(0)
  useEffect(() => { void (async () => { const t: string[] = []; for (let p = 1; p <= pdf.numPages; p++) t.push((await (await pdf.getPage(p)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ').toLowerCase()); setTexts(t) })() }, [pdf])
  const hits = useMemo(() => (q.trim().length > 1 ? texts.flatMap((t, i) => (t.includes(q.toLowerCase()) ? [i + 1] : [])) : []), [q, texts])
  const goto = (p: number) => { const n = Math.min(pdf.numPages, Math.max(1, p)); box.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: 'start' }); setCur(n) }
  const find = (d: number) => { if (!hits.length) return; const i = (hit + d + hits.length) % hits.length; setHit(i); goto(hits[i]!) }
  return (
    <>
      <Bar>
        <TB title="prev" onClick={() => goto(cur - 1)} disabled={cur <= 1}><ChevronLeft className="size-4" /></TB>
        <input aria-label="page" value={cur} onChange={(e) => goto(+e.target.value || 1)} className="h-7 w-12 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs" />
        <span className="text-xs text-[var(--color-text-tertiary)]">/ {pdf.numPages}</span>
        <TB title="next" onClick={() => goto(cur + 1)} disabled={cur >= pdf.numPages}><ChevronRight className="size-4" /></TB><Sep />
        <Search className="ml-1 size-3.5 text-[var(--color-text-tertiary)]" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setHit(0) }} onKeyDown={(e) => e.key === 'Enter' && find(e.shiftKey ? -1 : 1)} placeholder={r('search')} className="h-7 w-40 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs" />
        {q.trim().length > 1 && <span className="px-1 text-xs text-[var(--color-text-tertiary)]">{hits.length ? `${hit + 1}/${hits.length} ${r('pagesFound')}` : r('none')}</span>}
        <TB title="prev" onClick={() => find(-1)} disabled={!hits.length}><ChevronLeft className="size-4 rotate-90" /></TB><TB title="next" onClick={() => find(1)} disabled={!hits.length}><ChevronRight className="size-4 rotate-90" /></TB>
      </Bar>
      <div ref={box} className="flex-1 overflow-auto bg-[var(--color-surface-sunken)] p-4" onScroll={(e) => { const el = e.currentTarget; const ps = [...el.querySelectorAll<HTMLElement>('[data-page]')]; const top = el.getBoundingClientRect().top + 80; const p = ps.filter((x) => x.getBoundingClientRect().top <= top).pop(); if (p) setCur(+p.dataset.page!) }}>
        <div className="mx-auto flex w-fit flex-col gap-4">{Array.from({ length: pdf.numPages }, (_, i) => <PdfPage key={i} pdf={pdf} n={i + 1} zoom={zoom} dark={dark} />)}</div>
      </div>
    </>
  )
}

function PdfPage({ pdf, n, zoom, dark }: { pdf: import('pdfjs-dist').PDFDocumentProxy; n: number; zoom: number; dark: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const holder = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 800 })
  const [vis, setVis] = useState(false)
  useEffect(() => { void pdf.getPage(n).then((p) => { const v = p.getViewport({ scale: 1.3 * zoom }); setSize({ w: v.width, h: v.height }) }) }, [pdf, n, zoom])
  useEffect(() => { const io = new IntersectionObserver(([e]) => setVis(!!e?.isIntersecting), { rootMargin: '600px' }); if (holder.current) io.observe(holder.current); return () => io.disconnect() }, [])
  useEffect(() => {
    if (!vis) return
    let task: { cancel: () => void } | null = null
    void pdf.getPage(n).then((p) => {
      const sc = 1.3 * zoom, dpr = window.devicePixelRatio || 1, v = p.getViewport({ scale: sc * dpr }), c = cv.current!
      c.width = v.width; c.height = v.height
      const t = p.render({ canvasContext: c.getContext('2d')!, viewport: v, canvas: c }); task = t; t.promise.catch(() => {})
    })
    return () => task?.cancel()
  }, [vis, pdf, n, zoom])
  return <div ref={holder} data-page={n} className="bg-white shadow-[var(--shadow-md)]" style={{ width: size.w, height: size.h }}><canvas ref={cv} style={{ width: size.w, height: size.h, filter: dark ? 'invert(0.92) hue-rotate(180deg)' : undefined }} /></div>
}

function SheetView({ book, dark }: { book: XLSX.WorkBook; dark: boolean }) {
  const [si, setSi] = useState(0)
  const rows = useMemo(() => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[si]!]!, { header: 1, raw: false, defval: '' }).slice(0, 3000), [book, si])
  const cols = Math.min(60, Math.max(0, ...rows.map((x) => x.length)))
  return (
    <>
      <div className={`flex-1 overflow-auto ${dark ? 'bg-neutral-900 text-neutral-200' : 'bg-white text-neutral-900'}`}>
        <table className="border-collapse text-xs">
          <thead><tr><th className="sticky left-0 top-0 z-20 border border-[var(--color-border)] bg-[var(--color-surface-raised)]" />{Array.from({ length: cols }, (_, c) => <th key={c} className="sticky top-0 z-10 min-w-24 border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1 font-medium text-[var(--color-text-secondary)]">{XLSX.utils.encode_col(c)}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i}><td className="sticky left-0 border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-center text-[var(--color-text-tertiary)]">{i + 1}</td>{Array.from({ length: cols }, (_, c) => <td key={c} className="max-w-72 truncate border border-[var(--color-border)] px-2 py-0.5">{String(row[c] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {book.SheetNames.length > 1 && <div className="flex gap-1 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1">{book.SheetNames.map((n, i) => <button key={n} type="button" onClick={() => setSi(i)} className={`rounded-md px-3 py-1 text-xs ${i === si ? 'bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'}`}>{n}</button>)}</div>}
    </>
  )
}

function DeckView({ deck, zoom, dark }: { deck: Deck; zoom: number; dark: boolean }) {
  const [i, setI] = useState(0)
  const w = 880 * zoom, h = (w * deck.h) / deck.w
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="hidden w-44 shrink-0 space-y-2 overflow-auto border-r border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2 sm:block">
        {deck.slides.map((s, k) => <button key={s.id} type="button" onClick={() => setI(k)} className={`block w-full overflow-hidden rounded border-2 ${k === i ? 'border-[var(--color-accent)]' : 'border-transparent'}`}><SlideView slide={s} w={160} h={(160 * deck.h) / deck.w} /></button>)}
      </div>
      <div className={`flex flex-1 flex-col items-center gap-3 overflow-auto p-6 ${dark ? 'bg-neutral-950' : 'bg-[var(--color-surface-sunken)]'}`}>
        <div className="shadow-[var(--shadow-md)]"><SlideView slide={deck.slides[i]!} w={w} h={h} /></div>
        <div className="flex items-center gap-2 text-xs"><TB title="prev" onClick={() => setI((x) => Math.max(0, x - 1))}><ChevronLeft className="size-4" /></TB>{i + 1} / {deck.slides.length}<TB title="next" onClick={() => setI((x) => Math.min(deck.slides.length - 1, x + 1))}><ChevronRight className="size-4" /></TB></div>
      </div>
    </div>
  )
}
