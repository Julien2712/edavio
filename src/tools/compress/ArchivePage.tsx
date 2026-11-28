import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FolderOpen, Loader2, Package, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PlannedTool } from '../planned/PlannedTool'
import type { Level } from './compressors'
import { createArchive, extractArchive, type Entry } from './archives'

const fmt = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`)
function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export default function ArchivePage() {
  const { t } = useTranslation()
  const c = (k: string, o?: Record<string, unknown>) => (t as unknown as (k: string, o?: unknown) => string)(`archive.${k}`, o)
  const [mode, setMode] = useState<'create' | 'extract'>('create')
  const [files, setFiles] = useState<File[]>([])
  const [kind, setKind] = useState<'zip' | 'tar.gz'>('zip')
  const [level, setLevel] = useState<Level>('balanced')
  const [busy, setBusy] = useState(false)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)

  const add = async (list: FileList | File[]) => {
    setError(null)
    if (mode === 'create') { setFiles((cur) => [...cur, ...list]); return }
    const f = [...list][0]
    if (!f) return
    setBusy(true)
    try { setEntries(await extractArchive(f)) } catch { setError(c('extractError')); setEntries(null) } finally { setBusy(false) }
  }
  const build = async () => {
    setBusy(true); setInfo(null)
    try {
      const blob = await createArchive(files, kind, level)
      const before = files.reduce((a, f) => a + f.size, 0)
      setInfo(`${fmt(before)} → ${fmt(blob.size)}`)
      save(blob, `edavio-archive.${kind}`)
    } catch { setError(c('createError')) } finally { setBusy(false) }
  }

  return (
    <PlannedTool toolId="archive-tool" formats={['ZIP', 'TAR.GZ', 'TGZ', 'TAR', 'GZ']} features={[]} hideDrop live>
      <div className="mt-6 inline-flex rounded-lg border border-[var(--color-border)] p-0.5">
        {(['create', 'extract'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setFiles([]); setEntries(null); setError(null); setInfo(null) }} className={cn('rounded-md px-4 py-1.5 text-sm', mode === m ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)]')}>{c(m)}</button>
        ))}
      </div>
      <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void add(e.dataTransfer.files) }}
        className="mt-4 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]">
        <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]"><Upload className="size-5" aria-hidden /></div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{mode === 'create' ? c('dropCreate') : c('dropExtract')}</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">{c('hint')}</p>
      </div>
      <input ref={input} type="file" multiple={mode === 'create'} accept={mode === 'extract' ? '.zip,.tar,.gz,.tgz' : undefined} className="sr-only" tabIndex={-1} onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = '' }} />
      <input ref={dirInput} type="file" className="sr-only" tabIndex={-1} {...({ webkitdirectory: '' } as object)} onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = '' }} />
      {mode === 'create' && <Button variant="secondary" size="sm" className="mt-3 gap-1.5" onClick={() => dirInput.current?.click()}><FolderOpen className="size-4" />{c('addFolder')}</Button>}

      {mode === 'create' && files.length > 0 && (
        <>
          <ul className="mt-5 max-h-64 divide-y divide-[var(--color-border-subtle)] overflow-auto rounded-xl border border-[var(--color-border)]">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Package className="size-4 shrink-0 text-[var(--color-text-tertiary)]" />
                <span className="min-w-0 flex-1 truncate">{(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}</span>
                <span className="text-xs text-[var(--color-text-tertiary)]">{fmt(f.size)}</span>
                <button type="button" aria-label="remove" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--color-text-secondary)]">{c('format')}
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="mt-1 h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"><option value="zip">ZIP</option><option value="tar.gz">TAR.GZ</option></select></label>
            <label className="text-xs text-[var(--color-text-secondary)]">{c('level')}
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="mt-1 h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"><option value="light">{c('fast')}</option><option value="balanced">{c('normal')}</option><option value="max">{c('best')}</option></select></label>
          </div>
          <Button disabled={busy} onClick={() => void build()} className="mt-4 h-10 w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{c('build')}</Button>
          {info && <p className="mt-2 text-center text-sm text-[var(--color-text-secondary)]">{info}</p>}
          <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">{c('note')}</p>
        </>
      )}

      {mode === 'extract' && entries && (
        <ul className="mt-5 max-h-96 divide-y divide-[var(--color-border-subtle)] overflow-auto rounded-xl border border-[var(--color-border)]">
          {entries.map((e, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              <span className="text-xs text-[var(--color-text-tertiary)]">{fmt(e.data.length)}</span>
              <Button size="xs" variant="secondary" onClick={() => save(new Blob([e.data as BlobPart]), e.name.split('/').pop() || e.name)}><Download className="size-3.5" /></Button>
            </li>
          ))}
          {entries.length === 0 && <li className="px-4 py-3 text-sm text-[var(--color-text-tertiary)]">{c('empty')}</li>}
        </ul>
      )}
      {busy && mode === 'extract' && <Loader2 className="mx-auto mt-5 size-5 animate-spin text-[var(--color-accent)]" />}
      {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}
    </PlannedTool>
  )
}
