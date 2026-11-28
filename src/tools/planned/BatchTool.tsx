import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, Loader2, Trash2, Upload, FileIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlannedTool } from './PlannedTool'
import { fmtSize, saveBlob, zipFiles } from '../shared/util'
import { cn } from '@/lib/utils'

export interface OutFile { name: string; blob: Blob }
export interface Output { id: string; label: string }

interface Item { id: string; file: File; status: 'wait' | 'busy' | 'done' | 'error'; progress: number; outs?: OutFile[]; error?: string }

/** Shared frame of the converters: drop files, pick an output format, convert, download. */
export function BatchTool({ toolId, formats, re, hint, outputs, outputFor, options, run }: {
  toolId: string
  formats: string[]
  re: RegExp
  hint: string
  outputs: Output[]
  /** restrict the outputs offered for the dropped files (e.g. no "PDF → PDF") */
  outputFor?: (file: File) => string[]
  options?: (out: string) => ReactNode
  run: (file: File, out: string, progress: (r: number) => void) => Promise<OutFile[]>
}) {
  const { t } = useTranslation()
  const c = (k: string) => (t as unknown as (k: string) => string)(`convert.${k}`)
  const [items, setItems] = useState<Item[]>([])
  const [out, setOut] = useState(outputs[0]!.id)
  const [running, setRunning] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)))
  const add = (files: FileList | File[]) => setItems((cur) => [...cur, ...[...files].filter((f) => re.test(f.name)).map((file) => ({ id: crypto.randomUUID(), file, status: 'wait' as const, progress: 0 }))])
  const offered = outputFor && items.length ? outputs.filter((o) => items.some((i) => outputFor(i.file).includes(o.id))) : outputs
  const current = offered.some((o) => o.id === out) ? out : offered[0]?.id ?? out

  const go = async () => {
    setRunning(true)
    for (const it of items) {
      if (it.status === 'done') continue
      if (outputFor && !outputFor(it.file).includes(current)) { patch(it.id, { status: 'error', error: c('notSupported') }); continue }
      patch(it.id, { status: 'busy', progress: 0, error: undefined })
      try { patch(it.id, { status: 'done', progress: 1, outs: await run(it.file, current, (p) => patch(it.id, { progress: p })) }) }
      catch (e) { console.error(e); patch(it.id, { status: 'error', error: c('error') }) }
    }
    setRunning(false)
  }
  const all = items.flatMap((i) => i.outs ?? [])
  const downloadAll = async () => (all.length === 1 ? saveBlob(all[0]!.blob, all[0]!.name) : saveBlob(await zipFiles(all), 'edavio-converted.zip'))

  return (
    <PlannedTool toolId={toolId} formats={formats} features={[]} hideDrop live>
      <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files) }}
        className="mt-8 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]">
        <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]"><Upload className="size-5" aria-hidden /></div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{c('drop')}</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">{hint}</p>
      </div>
      <input ref={input} type="file" multiple accept={formats.map((f) => '.' + f.toLowerCase()).join(',')} className="sr-only" tabIndex={-1} onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} />

      <div className="mt-6 rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--color-text-tertiary)]">{c('convertTo')}</h2>
        <div className="flex flex-wrap gap-1.5">
          {offered.map((o) => (
            <button key={o.id} type="button" onClick={() => setOut(o.id)} className={cn('rounded-lg border px-3 py-1.5 text-sm', current === o.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]')}>{o.label}</button>
          ))}
        </div>
        {options && <div className="mt-4">{options(current)}</div>}
      </div>

      {items.length > 0 && (
        <ul className="mt-6 divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-xl border border-[var(--color-border)]">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              <FileIcon className="size-5 shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{i.file.name}</p>
                <p className={cn('text-xs', i.status === 'error' ? 'text-red-500' : 'text-[var(--color-text-tertiary)]')}>
                  {i.status === 'done' && i.outs ? `${fmtSize(i.file.size)} → ${i.outs.length > 1 ? `${i.outs.length} ${c('files')}` : fmtSize(i.outs[0]!.blob.size)}` : i.status === 'error' ? i.error : fmtSize(i.file.size)}
                </p>
                {i.status === 'busy' && <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[var(--color-border)]"><div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${Math.round(i.progress * 100)}%` }} /></div>}
              </div>
              {i.status === 'busy' && <Loader2 className="size-4 animate-spin text-[var(--color-accent)]" />}
              {i.status === 'done' && i.outs && (<><CheckCircle2 className="size-4 text-emerald-600" /><Button size="xs" variant="secondary" onClick={async () => (i.outs!.length === 1 ? saveBlob(i.outs![0]!.blob, i.outs![0]!.name) : saveBlob(await zipFiles(i.outs!), `${i.file.name.replace(/\.[^.]+$/, '')}.zip`))}><Download className="size-3.5" />{c('download')}</Button></>)}
              {!running && <button type="button" aria-label="remove" onClick={() => setItems((cur) => cur.filter((x) => x.id !== i.id))} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"><Trash2 className="size-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button disabled={running || !items.some((i) => i.status !== 'done')} onClick={() => void go()} className="h-10 flex-1">{running ? c('running') : c('run')}</Button>
        {all.length > 0 && <Button variant="secondary" className="h-10" onClick={() => void downloadAll()}><Download className="size-4" />{all.length > 1 ? c('downloadZip') : c('download')}</Button>}
      </div>
    </PlannedTool>
  )
}
