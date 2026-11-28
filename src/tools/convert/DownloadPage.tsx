import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, FolderOpen, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlannedTool } from '../planned/PlannedTool'
import { cn } from '@/lib/utils'

interface Bridge {
  status: () => Promise<{ available: boolean; version: string | null; downloads: string } | null>
  install: () => Promise<{ ok: boolean; version?: string; error?: string }>
  info: (url: string) => Promise<{ title: string; uploader: string; duration: string; thumbnail: string | null } | null>
  chooseDir: () => Promise<string | null>
  download: (o: { id: string; url: string; mode: 'video' | 'audio'; height: number; dir?: string }) => Promise<{ ok: boolean; file?: string; error?: string }>
  cancel: (id: string) => Promise<void>
  reveal: (file: string) => Promise<void>
  onProgress: (cb: (d: { id: string; percent?: number; speed?: string; eta?: string; log?: string }) => void) => () => void
}
const bridge = (): Bridge | undefined => (window as unknown as { edavio?: { ytdlp?: Bridge } }).edavio?.ytdlp

export default function DownloadPage() {
  const { t } = useTranslation()
  const c = (k: string) => (t as unknown as (k: string) => string)(`download.${k}`)
  const api = bridge()
  const [st, setSt] = useState<{ available: boolean; version: string | null; downloads: string } | null>(null)
  const [busyInstall, setBusyInstall] = useState(false)
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'video' | 'audio'>('video')
  const [height, setHeight] = useState(0)
  const [dir, setDir] = useState<string>()
  const [job, setJob] = useState<{ id: string; percent: number; speed?: string; eta?: string; log?: string } | null>(null)
  const [result, setResult] = useState<{ ok: boolean; file?: string; error?: string } | null>(null)
  const idRef = useRef('')
  const [meta, setMeta] = useState<{ title: string; uploader: string; duration: string; thumbnail: string | null } | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)

  useEffect(() => { void api?.status().then(setSt) }, [api])
  useEffect(() => api?.onProgress((d) => d.id === idRef.current && setJob((j) => ({ ...(j ?? { id: d.id, percent: 0 }), ...d, percent: d.percent ?? j?.percent ?? 0 }))), [api])

  useEffect(() => {
    setMeta(null)
    const u = url.trim()
    if (!api || !st?.available || !/^https?:\/\/\S+$/i.test(u)) return
    let live = true
    const t = setTimeout(() => { setLoadingMeta(true); void api.info(u).then((m) => { if (live) { setMeta(m); setLoadingMeta(false) } }) }, 300)
    return () => { live = false; clearTimeout(t); setLoadingMeta(false) }
  }, [url, api, st?.available])

  const install = async () => { setBusyInstall(true); const r = await api!.install(); setBusyInstall(false); if (r.ok) setSt(await api!.status()); else setResult({ ok: false, error: r.error }) }
  const start = async () => {
    idRef.current = crypto.randomUUID(); setResult(null); setJob({ id: idRef.current, percent: 0 })
    const r = await api!.download({ id: idRef.current, url: url.trim(), mode, height, dir })
    setJob(null); setResult(r)
  }
  const valid = /^https?:\/\/\S+$/i.test(url.trim())
  const Seg = <T extends string | number>({ v, set, items }: { v: T; set: (x: T) => void; items: [T, string][] }) => (
    <div className="flex flex-wrap gap-1.5">{items.map(([k, label]) => <button key={String(k)} type="button" onClick={() => set(k)} className={cn('rounded-lg border px-3 py-1.5 text-sm', v === k ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]')}>{label}</button>)}</div>
  )

  return (
    <PlannedTool toolId="video-downloader" formats={['YouTube', 'Vimeo', 'X', 'SoundCloud', '1000+']} features={[]} hideDrop live>
      {!api ? (
        <p className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-5 text-sm text-[var(--color-text-secondary)]">{c('desktopOnly')}</p>
      ) : !st ? (
        <Loader2 className="mx-auto mt-10 size-5 animate-spin text-[var(--color-accent)]" />
      ) : !st.available ? (
        <div className="mt-8 rounded-xl border border-[var(--color-border)] p-6">
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]">{c('needTitle')}</h2>
          <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">{c('needText')}</p>
          <Button className="mt-4" disabled={busyInstall} onClick={() => void install()}>{busyInstall ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{c('install')}</Button>
          {result && !result.ok && <p className="mt-3 text-xs text-red-500">{c('installError')}</p>}
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          <input value={url} onChange={(e) => { setUrl(e.target.value); setResult(null) }} placeholder="https://www.youtube.com/watch?v=…" aria-label="URL" disabled={!!job}
            className="disabled:opacity-60 h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm outline-none focus:border-[var(--color-accent)]" />
          {(loadingMeta || meta) && (
            <div className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] p-3">
              {loadingMeta ? <div className="flex h-20 flex-1 items-center justify-center"><Loader2 className="size-5 animate-spin text-[var(--color-accent)]" /></div> : meta && (<>
                {meta.thumbnail ? <img src={meta.thumbnail} alt="" className="h-20 w-36 shrink-0 rounded-lg object-cover" /> : <div className="h-20 w-36 shrink-0 rounded-lg bg-[var(--color-surface-sunken)]" />}
                <div className="min-w-0"><p className="line-clamp-2 text-sm font-medium text-[var(--color-text-primary)]">{meta.title}</p><p className="mt-1 truncate text-xs text-[var(--color-text-secondary)]">{meta.uploader}{meta.duration ? ` · ${meta.duration}` : ''}</p></div>
              </>)}
            </div>
          )}
          <fieldset disabled={!!job} className="space-y-4 rounded-xl border border-[var(--color-border)] p-5 text-sm text-[var(--color-text-secondary)] disabled:pointer-events-none disabled:opacity-50">
            <div className="flex items-center gap-3"><span className="w-28 shrink-0">{c('type')}</span><Seg v={mode} set={setMode} items={[['video', c('video')], ['audio', c('audio')]]} /></div>
            {mode === 'video' && <div className="flex items-center gap-3"><span className="w-28 shrink-0">{c('maxQuality')}</span><Seg v={height} set={setHeight} items={[[0, c('best')], [1080, '1080p'], [720, '720p'], [480, '480p'], [360, '360p']]} /></div>}
            <div className="flex items-center gap-3"><span className="w-28 shrink-0">{c('folder')}</span><span className="min-w-0 flex-1 truncate text-xs">{dir ?? st.downloads}</span><Button size="xs" variant="secondary" onClick={async () => { const d = await api.chooseDir(); if (d) setDir(d) }}><FolderOpen className="size-3.5" />{c('change')}</Button></div>
          </fieldset>
          {job ? (
            <div className="rounded-xl border border-[var(--color-border)] p-4">
              <div className="flex items-center gap-3 text-sm"><Loader2 className="size-4 animate-spin text-[var(--color-accent)]" /><span className="flex-1 tabular-nums">{job.percent === 0 && !job.speed ? c('preparing') : `${job.percent.toFixed(0)} %`} {job.speed && job.speed !== 'NA' ? `· ${job.speed}` : ''} {job.eta && job.eta !== 'NA' ? `· ${job.eta}` : ''}</span><Button size="xs" variant="secondary" onClick={() => { void api.cancel(job.id); idRef.current = ''; setJob(null) }}><X className="size-3.5" />{c('cancel')}</Button></div>
              {job.log && <p className="mt-2 truncate text-xs text-[var(--color-text-tertiary)]">{job.log}</p>}
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-[var(--color-border)]"><div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${job.percent}%` }} /></div>
            </div>
          ) : <Button className="h-11 w-full" disabled={!valid} onClick={() => void start()}><Download className="size-4" />{c('download')}</Button>}
          {result?.ok && <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm"><CheckCircle2 className="size-5 text-emerald-600" /><span className="min-w-0 flex-1 truncate">{result.file}</span><Button size="xs" variant="secondary" onClick={() => void api.reveal(result.file!)}>{c('show')}</Button></div>}
          {result && !result.ok && result.error !== 'cancelled' && <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-600">{c('failed')} {result.error}</p>}
          <p className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]"><span>{c('rights')}</span><button type="button" disabled={busyInstall} onClick={() => void install()} className="inline-flex items-center gap-1 hover:text-[var(--color-text-primary)]"><RefreshCw className={cn('size-3', busyInstall && 'animate-spin')} />yt-dlp {st.version} · {c('update')}</button></p>
        </div>
      )}
    </PlannedTool>
  )
}
