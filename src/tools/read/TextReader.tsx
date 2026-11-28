import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Minus, Plus, Search, WrapText, Hash } from 'lucide-react'
import { importDocumentFile } from '../document/docFormats'
import { saveBlob } from '../shared/util'
import { Bar, CloseBtn, ReaderFrame, Sep, TB, useR } from './ui'

interface T { name: string; ext: string; text: string; html?: string }

async function load([f]: File[]): Promise<T> {
  const ext = f!.name.split('.').pop()!.toLowerCase()
  let text = await f!.text()
  if (ext === 'json') { try { text = JSON.stringify(JSON.parse(text), null, 2) } catch { /* keep raw */ } }
  const html = ext === 'md' || ext === 'markdown' ? (await importDocumentFile(f!)).html : undefined
  return { name: f!.name, ext, text, html }
}

export default function TextReaderPage() {
  const r = useR()
  return (
    <ReaderFrame toolId="text-reader" formats={['TXT', 'MD', 'JSON', 'CSV', 'XML', 'HTML', 'LOG', 'YAML']} re={/\.(txt|md|markdown|json|csv|tsv|xml|html?|log|ya?ml|ini|cfg|conf|js|ts|css|py|sql)$/i} hint={r('textHint')} load={load}>
      {(d, close) => <Viewer d={d} close={close} />}
    </ReaderFrame>
  )
}

function Viewer({ d, close }: { d: T; close: () => void }) {
  const r = useR()
  const isMd = !!d.html, isCsv = d.ext === 'csv' || d.ext === 'tsv'
  const [mode, setMode] = useState<'raw' | 'view'>(isMd || isCsv ? 'view' : 'raw')
  const [size, setSize] = useState(13)
  const [wrap, setWrap] = useState(true)
  const [nums, setNums] = useState(true)
  const [q, setQ] = useState('')
  const lines = useMemo(() => d.text.split('\n'), [d.text])
  const matches = useMemo(() => (q ? lines.filter((l) => l.toLowerCase().includes(q.toLowerCase())).length : 0), [q, lines])
  const rows = useMemo(() => (isCsv && mode === 'view' ? XLSX.utils.sheet_to_json<string[]>(XLSX.read(d.text, { type: 'string', FS: d.ext === 'tsv' ? '\t' : undefined } as XLSX.ParsingOptions).Sheets.Sheet1!, { header: 1, raw: false }).slice(0, 5000) : []), [d, isCsv, mode])
  const mark = (l: string) => {
    if (!q) return l
    const parts = l.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
    return parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-yellow-200 text-black">{p}</mark> : p))
  }
  return (
    <>
      <Bar>
        <CloseBtn onClick={close} /><Sep />
        <span className="max-w-[200px] truncate px-1 text-xs font-medium text-[var(--color-text-primary)]">{d.name}</span><Sep />
        {(isMd || isCsv) && <><TB title={r('rendered')} active={mode === 'view'} onClick={() => setMode('view')}>{r('rendered')}</TB><TB title={r('source')} active={mode === 'raw'} onClick={() => setMode('raw')}>{r('source')}</TB><Sep /></>}
        <TB title={r('zoomOut')} onClick={() => setSize((s) => Math.max(9, s - 1))}><Minus className="size-4" /></TB><span className="w-8 text-center text-xs tabular-nums">{size}</span><TB title={r('zoomIn')} onClick={() => setSize((s) => Math.min(28, s + 1))}><Plus className="size-4" /></TB>
        <TB title={r('wrap')} active={wrap} onClick={() => setWrap((x) => !x)}><WrapText className="size-4" /></TB>
        <TB title={r('lineNumbers')} active={nums} onClick={() => setNums((x) => !x)}><Hash className="size-4" /></TB><Sep />
        <Search className="ml-1 size-3.5 text-[var(--color-text-tertiary)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={r('search')} className="h-7 w-40 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs" />
        {q && <span className="px-1 text-xs text-[var(--color-text-tertiary)]">{matches} {r('linesFound')}</span>}
        <span className="ml-auto px-2 text-xs text-[var(--color-text-tertiary)]">{lines.length} {r('lines')} · {d.text.length.toLocaleString()} {r('chars')}</span>
        <TB title={r('download')} onClick={() => saveBlob(new Blob([d.text]), d.name)}><Download className="size-4" /></TB>
      </Bar>
      <div className="flex-1 overflow-auto bg-[var(--color-surface)]">
        {mode === 'view' && isMd && <article className="doc-read mx-auto max-w-3xl p-10" style={{ fontSize: size + 2 }} dangerouslySetInnerHTML={{ __html: d.html! }} />}
        {mode === 'view' && isCsv && <table className="border-collapse" style={{ fontSize: size }}><tbody>{rows.map((row, i) => <tr key={i} className={i === 0 ? 'sticky top-0 bg-[var(--color-surface-raised)] font-medium' : ''}>{row.map((c, k) => <td key={k} className="border border-[var(--color-border)] px-2 py-0.5">{c}</td>)}</tr>)}</tbody></table>}
        {mode === 'raw' && (
          <pre className="m-0 p-4 font-mono leading-relaxed text-[var(--color-text-primary)]" style={{ fontSize: size, whiteSpace: wrap ? 'pre-wrap' : 'pre' }}>
            {lines.map((l, i) => <div key={i} className="flex">{nums && <span className="mr-4 w-10 shrink-0 select-none text-right text-[var(--color-text-tertiary)]">{i + 1}</span>}<span className="min-w-0 flex-1 break-words">{mark(l) || ' '}</span></div>)}
          </pre>
        )}
      </div>
    </>
  )
}
