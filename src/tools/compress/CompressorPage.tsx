import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import JSZip from 'jszip'
import { Download, FileArchive, Loader2, Trash2, Upload, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PlannedTool } from '../planned/PlannedTool'
import { ACCEPT, compressFile, type CompressResult, type Level } from './compressors'

interface Item {
  id: string
  file: File
  status: 'wait' | 'busy' | 'done' | 'error'
  progress: number
  result?: CompressResult
}

const fmt = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(n >= 10485760 ? 1 : 2)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`)

function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export default function CompressorPage() {
  const { t } = useTranslation()
  const c = (k: string, o?: Record<string, unknown>) => (t as unknown as (k: string, o?: unknown) => string)(`compressor.${k}`, o)
  const [items, setItems] = useState<Item[]>([])
  const [level, setLevel] = useState<Level>('balanced')
  const [strip, setStrip] = useState(false)
  const [running, setRunning] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const add = (files: FileList | File[]) => {
    const ok = [...files].filter((f) => /\.(pdf|docx|pptx|xlsx|odt|ods|odp|jpe?g|png|webp)$/i.test(f.name))
    setItems((cur) => [...cur, ...ok.map((file) => ({ id: crypto.randomUUID(), file, status: 'wait' as const, progress: 0 }))])
  }
  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)))

  const run = async () => {
    setRunning(true)
    for (const it of items) {
      if (it.status === 'done') continue
      patch(it.id, { status: 'busy', progress: 0 })
      try {
        const result = await compressFile(it.file, level, strip, (p) => patch(it.id, { progress: p }))
        patch(it.id, { status: 'done', progress: 1, result })
      } catch (e) {
        console.error(e)
        patch(it.id, { status: 'error' })
      }
    }
    setRunning(false)
  }

  const done = items.filter((i) => i.status === 'done' && i.result)
  const totalBefore = done.reduce((a, i) => a + i.result!.before, 0)
  const totalAfter = done.reduce((a, i) => a + i.result!.after, 0)
  const downloadAll = async () => {
    if (done.length === 1) return save(done[0]!.result!.blob, done[0]!.result!.name)
    const zip = new JSZip()
    for (const i of done) zip.file(i.result!.name, i.result!.blob)
    save(await zip.generateAsync({ type: 'blob' }), 'edavio-compressed.zip')
  }

  return (
    <PlannedTool toolId="pdf-compressor" formats={['PDF', 'DOCX', 'PPTX', 'XLSX', 'ODT', 'JPG', 'PNG', 'WebP']} features={[]} hideDrop live>
      <div
        role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files) }}
        className="mt-8 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]"
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]"><Upload className="size-5" aria-hidden /></div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{c('drop')}</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">{c('dropHint')}</p>
      </div>
      <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} />

      <div className="mt-6 rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--color-text-tertiary)]">{c('level')}</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['light', 'balanced', 'max'] as Level[]).map((l) => (
            <button key={l} type="button" onClick={() => setLevel(l)} className={cn('rounded-lg border p-3 text-left', level === l ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'border-[var(--color-border)] hover:border-[var(--color-accent)]')}>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{c(l)}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{c(`${l}Hint`)}</p>
            </button>
          ))}
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-secondary)]"><input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} />{c('stripMeta')}</label>
      </div>

      {items.length > 0 && (
        <ul className="mt-6 divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-xl border border-[var(--color-border)]">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              <FileArchive className="size-5 shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{i.file.name}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {i.status === 'done' && i.result ? (i.result.unchanged ? `${fmt(i.result.before)} · ${c('noGain')}` : `${fmt(i.result.before)} → ${fmt(i.result.after)} (−${Math.round((1 - i.result.after / i.result.before) * 100)} %)`) : i.status === 'error' ? c('error') : fmt(i.file.size)}
                </p>
                {i.status === 'busy' && <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[var(--color-border)]"><div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${Math.round(i.progress * 100)}%` }} /></div>}
              </div>
              {i.status === 'busy' && <Loader2 className="size-4 animate-spin text-[var(--color-accent)]" />}
              {i.status === 'done' && i.result && (<><CheckCircle2 className="size-4 text-emerald-600" /><Button size="xs" variant="secondary" onClick={() => save(i.result!.blob, i.result!.name)}><Download className="size-3.5" />{c('download')}</Button></>)}
              {!running && <button type="button" aria-label={c('remove')} onClick={() => setItems((cur) => cur.filter((x) => x.id !== i.id))} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"><Trash2 className="size-4" /></button>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button disabled={running || !items.some((i) => i.status !== 'done')} onClick={() => void run()} className="h-10 flex-1">{running ? c('running') : c('run')}</Button>
        {done.length > 0 && <Button variant="secondary" className="h-10" onClick={() => void downloadAll()}><Download className="size-4" />{done.length > 1 ? c('downloadZip') : c('download')}</Button>}
      </div>
      {done.length > 0 && <p className="mt-3 text-center text-sm text-[var(--color-text-secondary)]">{c('total', { before: fmt(totalBefore), after: fmt(totalAfter), pct: Math.max(0, Math.round((1 - totalAfter / Math.max(1, totalBefore)) * 100)) })}</p>}
    </PlannedTool>
  )
}
