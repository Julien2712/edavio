import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'
import { BatchTool, type OutFile } from '../planned/BatchTool'
import { baseName, canvasBlob, decodeImage, loadPdfJs } from '../shared/util'
import { htmlToPdf } from './htmlToPdf'
import { runFfmpeg } from '../shared/ffmpeg'
import { exportDocumentAsDocx, exportDocumentAsHtml, exportDocumentAsMarkdown, exportDocumentAsTxt, importDocumentFile } from '../document/docFormats'

const useC = () => { const { t } = useTranslation(); return (k: string) => (t as unknown as (k: string) => string)(`convert.${k}`) }
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function Slider({ label, value, min, max, step = 1, onChange, suffix = '' }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
      <span className="w-36 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="flex-1 accent-[var(--color-accent)]" />
      <span className="w-14 text-right tabular-nums">{value}{suffix}</span>
    </label>
  )
}

// ── Images ───────────────────────────────────────────────────────────────────

export function ImageConverterPage() {
  const c = useC()
  const [quality, setQuality] = useState(90)
  const [maxPx, setMaxPx] = useState(0)
  return (
    <BatchTool toolId="image-converter" formats={['PNG', 'JPG', 'WEBP', 'GIF', 'BMP', 'AVIF', 'SVG']} re={/\.(jpe?g|png|webp|gif|bmp|avif|svg|ico)$/i} hint={c('imgHint')}
      outputs={[{ id: 'png', label: 'PNG' }, { id: 'jpg', label: 'JPG' }, { id: 'webp', label: 'WebP' }, { id: 'pdf', label: 'PDF' }]}
      options={(o) => (
        <div className="space-y-3">
          {o !== 'png' && o !== 'pdf' && <Slider label={c('quality')} value={quality} min={30} max={100} onChange={setQuality} suffix=" %" />}
          {o !== 'pdf' && <Slider label={c('maxSide')} value={maxPx} min={0} max={4000} step={100} onChange={setMaxPx} suffix={maxPx ? ' px' : ' ∞'} />}
        </div>
      )}
      run={async (file, out) => {
        const bmp = await decodeImage(file)
        const k = maxPx ? Math.min(1, maxPx / Math.max(bmp.width, bmp.height)) : 1
        const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h
        const g = cv.getContext('2d')!
        if (out === 'jpg' || out === 'pdf') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h) }
        g.drawImage(bmp, 0, 0, w, h)
        if (out === 'pdf') {
          const pdf = await PDFDocument.create()
          const img = await pdf.embedJpg(await (await canvasBlob(cv, 'image/jpeg', 0.92)).arrayBuffer())
          pdf.addPage([w * 0.75, h * 0.75]).drawImage(img, { x: 0, y: 0, width: w * 0.75, height: h * 0.75 })
          return [{ name: baseName(file.name) + '.pdf', blob: new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' }) }]
        }
        return [{ name: `${baseName(file.name)}.${out}`, blob: await canvasBlob(cv, MIME[out]!, quality / 100) }]
      }}
    />
  )
}

// ── PDF ↔ images ─────────────────────────────────────────────────────────────

export function PdfImagesPage() {
  const c = useC()
  const [scale, setScale] = useState(2)
  const [quality, setQuality] = useState(90)
  const [range, setRange] = useState('')
  const [pageSize, setPageSize] = useState<'fit' | 'a4'>('fit')
  const isPdf = (f: File) => /\.pdf$/i.test(f.name)
  return (
    <BatchTool toolId="pdf-images" formats={['PDF', 'PNG', 'JPG', 'WEBP']} re={/\.(pdf|jpe?g|png|webp|gif|bmp)$/i} hint={c('pdfImgHint')}
      outputs={[{ id: 'png', label: c('pdfToPng') }, { id: 'jpg', label: c('pdfToJpg') }, { id: 'webp', label: c('pdfToWebp') }, { id: 'pdf', label: c('imgsToPdf') }]}
      outputFor={(f) => (isPdf(f) ? ['png', 'jpg', 'webp'] : ['pdf'])}
      options={(o) => o === 'pdf' ? (
        <div className="flex gap-1.5 text-sm">
          {(['fit', 'a4'] as const).map((s) => <button key={s} type="button" onClick={() => setPageSize(s)} className={`rounded-lg border px-3 py-1.5 ${pageSize === s ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>{s === 'fit' ? c('pageFit') : 'A4'}</button>)}
        </div>
      ) : (
        <div className="space-y-3">
          <Slider label={c('resolution')} value={scale} min={1} max={4} step={0.5} onChange={setScale} suffix="×" />
          {o !== 'png' && <Slider label={c('quality')} value={quality} min={30} max={100} onChange={setQuality} suffix=" %" />}
          <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]"><span className="w-36 shrink-0">{c('pages')}</span>
            <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3, 5" className="h-8 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm" /></label>
        </div>
      )}
      run={async (file, out, progress) => {
        if (out === 'pdf') {
          const bmp = await decodeImage(file)
          const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height
          const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0)
          const pdf = await PDFDocument.create()
          const img = await pdf.embedJpg(await (await canvasBlob(cv, 'image/jpeg', 0.92)).arrayBuffer())
          if (pageSize === 'a4') {
            const [pw, ph] = [595.28, 841.89], m = 28
            const s = Math.min((pw - 2 * m) / bmp.width, (ph - 2 * m) / bmp.height)
            pdf.addPage([pw, ph]).drawImage(img, { x: (pw - bmp.width * s) / 2, y: (ph - bmp.height * s) / 2, width: bmp.width * s, height: bmp.height * s })
          } else pdf.addPage([bmp.width * 0.75, bmp.height * 0.75]).drawImage(img, { x: 0, y: 0, width: bmp.width * 0.75, height: bmp.height * 0.75 })
          return [{ name: baseName(file.name) + '.pdf', blob: new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' }) }]
        }
        const pdfjs = await loadPdfJs()
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
        const want = new Set<number>()
        if (range.trim()) for (const part of range.split(',')) { const [a, b] = part.trim().split('-').map(Number); for (let p = a!; p <= (b || a!); p++) if (p >= 1 && p <= doc.numPages) want.add(p) }
        else for (let p = 1; p <= doc.numPages; p++) want.add(p)
        const outs: OutFile[] = []
        let n = 0
        for (const p of [...want].sort((a, b) => a - b)) {
          const page = await doc.getPage(p)
          const vp = page.getViewport({ scale })
          const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height)
          const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height)
          await page.render({ canvasContext: g, viewport: vp, canvas: cv }).promise
          outs.push({ name: `${baseName(file.name)}-${String(p).padStart(2, '0')}.${out}`, blob: await canvasBlob(cv, MIME[out]!, quality / 100) })
          progress(++n / want.size)
        }
        return outs
      }}
    />
  )
}

// ── Spreadsheets ─────────────────────────────────────────────────────────────

export function SpreadsheetConverterPage() {
  const c = useC()
  const [sep, setSep] = useState(';')
  const [allSheets, setAllSheets] = useState(false)
  return (
    <BatchTool toolId="spreadsheet-converter" formats={['XLSX', 'XLS', 'CSV', 'TSV', 'ODS']} re={/\.(xlsx|xlsm|xls|csv|tsv|ods|json)$/i} hint={c('sheetHint')}
      outputs={[{ id: 'xlsx', label: 'XLSX' }, { id: 'csv', label: 'CSV' }, { id: 'tsv', label: 'TSV' }, { id: 'ods', label: 'ODS' }, { id: 'json', label: 'JSON' }, { id: 'html', label: 'HTML' }]}
      options={(o) => (
        <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
          {o === 'csv' && (<div className="flex items-center gap-3"><span className="w-36 shrink-0">{c('separator')}</span>{[';', ',', '|'].map((s) => <button key={s} type="button" onClick={() => setSep(s)} className={`size-8 rounded-lg border ${sep === s ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}>{s}</button>)}</div>)}
          {['csv', 'tsv', 'json', 'html'].includes(o) && <label className="flex items-center gap-2"><input type="checkbox" checked={allSheets} onChange={(e) => setAllSheets(e.target.checked)} className="accent-[var(--color-accent)]" />{c('allSheets')}</label>}
        </div>
      )}
      run={async (file, out) => {
        const isJson = /\.json$/i.test(file.name)
        let book: XLSX.WorkBook
        if (isJson) {
          const data = JSON.parse(await file.text())
          book = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(Array.isArray(data) ? data : [data]), 'Sheet1')
        } else book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
        const mk = (data: BlobPart, type: string, ext: string, suffix = '') => ({ name: `${baseName(file.name)}${suffix}.${ext}`, blob: new Blob([data], { type }) })
        if (out === 'xlsx' || out === 'ods') {
          const buf = XLSX.write(book, { type: 'array', bookType: out }) as ArrayBuffer
          return [mk(buf, 'application/octet-stream', out)]
        }
        const names = allSheets ? book.SheetNames : book.SheetNames.slice(0, 1)
        return names.map((n) => {
          const ws = book.Sheets[n]!
          const suffix = allSheets && book.SheetNames.length > 1 ? `-${n}` : ''
          if (out === 'json') return mk(JSON.stringify(XLSX.utils.sheet_to_json(ws, { raw: false }), null, 2), 'application/json', 'json', suffix)
          if (out === 'html') return mk(XLSX.utils.sheet_to_html(ws), 'text/html', 'html', suffix)
          const csv = XLSX.utils.sheet_to_csv(ws, { FS: out === 'tsv' ? '\t' : sep })
          return mk('﻿' + csv, 'text/csv;charset=utf-8', out, suffix)
        })
      }}
    />
  )
}

// ── Documents ────────────────────────────────────────────────────────────────

async function pdfToHtml(file: File): Promise<string> {
  const pdfjs = await loadPdfJs()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let html = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    let line = '', lastY: number | null = null
    const lines: string[] = []
    for (const it of tc.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = it.transform[5]!
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = '' }
      line += it.str; lastY = y
    }
    lines.push(line)
    // merge lines into paragraphs: blank line (or a gap) = new paragraph
    html += lines.filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join('')
  }
  return html
}

export function DocumentConverterPage() {
  const c = useC()
  return (
    <BatchTool toolId="document-converter" formats={['DOCX', 'PDF', 'HTML', 'MD', 'TXT', 'RTF']} re={/\.(docx|pdf|html?|md|markdown|txt|rtf)$/i} hint={c('docHint')}
      outputs={[{ id: 'docx', label: 'DOCX' }, { id: 'pdf', label: 'PDF' }, { id: 'html', label: 'HTML' }, { id: 'md', label: 'Markdown' }, { id: 'txt', label: 'TXT' }]}
      outputFor={(f) => ['docx', 'pdf', 'html', 'md', 'txt'].filter((o) => !(o === 'pdf' && /\.pdf$/i.test(f.name)))}
      run={async (file, out) => {
        const name = baseName(file.name)
        let html: string
        if (/\.pdf$/i.test(file.name)) html = await pdfToHtml(file)
        else html = (await importDocumentFile(file)).html
        const blob = out === 'docx' ? await exportDocumentAsDocx(html, name)
          : out === 'html' ? exportDocumentAsHtml(html, name)
          : out === 'md' ? exportDocumentAsMarkdown(html)
          : out === 'txt' ? exportDocumentAsTxt(html)
          : await htmlToPdf(html, name)
        return [{ name: `${name}.${out}`, blob }]
      }}
    />
  )
}

// ── Audio / video (ffmpeg compiled to WebAssembly, runs locally) ─────────────

const AUDIO_OUT = ['mp3', 'm4a', 'ogg', 'wav', 'flac']
const isAudioFile = (f: File) => /\.(mp3|wav|ogg|aac|m4a|flac|opus|wma)$/i.test(f.name)

export function MediaConverterPage() {
  const c = useC()
  const [height, setHeight] = useState(0)
  const [abr, setAbr] = useState(192)
  const [quality, setQuality] = useState<'high' | 'balanced' | 'small'>('balanced')
  const crf = { high: 20, balanced: 26, small: 32 }[quality]
  return (
    <BatchTool toolId="media-converter" formats={['MP4', 'MKV', 'WEBM', 'MOV', 'AVI', 'MP3', 'WAV', 'OGG', 'M4A', 'FLAC']} re={/\.(mp4|mov|mkv|webm|m4v|avi|wmv|flv|mp3|wav|ogg|aac|m4a|flac|opus|wma)$/i} hint={c('mediaHint')}
      outputs={[{ id: 'mp4', label: 'MP4' }, { id: 'webm', label: 'WebM' }, { id: 'gif', label: 'GIF' }, { id: 'mp3', label: 'MP3' }, { id: 'm4a', label: 'M4A' }, { id: 'ogg', label: 'OGG' }, { id: 'wav', label: 'WAV' }, { id: 'flac', label: 'FLAC' }]}
      outputFor={(f) => (isAudioFile(f) ? AUDIO_OUT : ['mp4', 'webm', 'gif', ...AUDIO_OUT])}
      options={(o) => (
        <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
          {['mp4', 'webm'].includes(o) && (<>
            <div className="flex items-center gap-3"><span className="w-36 shrink-0">{c('quality')}</span>{(['high', 'balanced', 'small'] as const).map((q) => <button key={q} type="button" onClick={() => setQuality(q)} className={`rounded-lg border px-3 py-1 ${quality === q ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}>{c('q_' + q)}</button>)}</div>
            <Slider label={c('maxHeight')} value={height} min={0} max={2160} step={120} onChange={setHeight} suffix={height ? ' p' : ' ∞'} />
          </>)}
          {o === 'gif' && <Slider label={c('maxHeight')} value={height || 360} min={120} max={720} step={60} onChange={setHeight} suffix=" p" />}
          {['mp3', 'm4a', 'ogg'].includes(o) && <Slider label={c('bitrate')} value={abr} min={64} max={320} step={32} onChange={setAbr} suffix=" kb/s" />}
        </div>
      )}
      run={async (file, out, progress) => {
        const vf = (h: number) => (h ? ['-vf', `scale=-2:${h}`] : [])
        const a = `${abr}k`
        const args: Record<string, string[]> = {
          mp4: [...vf(height), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
          webm: [...vf(height), '-c:v', 'libvpx', '-b:v', '0', '-crf', String(crf + 4), '-deadline', 'realtime', '-cpu-used', '5', '-c:a', 'libvorbis', '-b:a', '128k'],
          gif: ['-vf', `fps=12,scale=-2:${height || 360}:flags=lanczos`, '-loop', '0', '-an'],
          mp3: ['-vn', '-c:a', 'libmp3lame', '-b:a', a],
          m4a: ['-vn', '-c:a', 'aac', '-b:a', a],
          ogg: ['-vn', '-c:a', 'libvorbis', '-b:a', a],
          wav: ['-vn', '-c:a', 'pcm_s16le'],
          flac: ['-vn', '-c:a', 'flac'],
        }
        return [{ name: `${baseName(file.name)}.${out}`, blob: await runFfmpeg(file, out, args[out]!, progress) }]
      }}
    />
  )
}
