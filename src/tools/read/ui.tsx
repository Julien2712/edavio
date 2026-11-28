import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X } from 'lucide-react'
import { PlannedTool } from '../planned/PlannedTool'
import { cn } from '@/lib/utils'

export const useR = () => { const { t } = useTranslation(); return (k: string) => (t as unknown as (k: string) => string)(`read.${k}`) }

export function TB({ title, onClick, active, disabled, children }: { title: string; onClick?: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className={cn('inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunken)] disabled:opacity-40', active && 'bg-[var(--color-accent-light)] text-[var(--color-accent)]')}>
      {children}
    </button>
  )
}
export const Sep = () => <span className="mx-1 h-5 w-px bg-[var(--color-border)]" />
export const Bar = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1.5">{children}</div>

/** Drop screen until a file is opened, then a full-width viewer with a close button. */
export function ReaderFrame<T>({ toolId, formats, re, hint, multiple, load, children }: {
  toolId: string; formats: string[]; re: RegExp; hint: string; multiple?: boolean
  load: (files: File[]) => Promise<T>
  children: (data: T, close: () => void) => ReactNode
}) {
  const r = useR()
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const open = async (list: FileList | File[]) => {
    const files = [...list].filter((f) => re.test(f.name))
    if (!files.length) return
    setBusy(true); setErr(false)
    try { setData(await load(multiple ? files : files.slice(0, 1))) } catch (e) { console.error(e); setErr(true) } finally { setBusy(false) }
  }
  if (data) return <div className="flex h-[calc(100vh-3.5rem)] min-h-[480px] flex-col">{children(data, () => setData(null))}</div>
  return (
    <PlannedTool toolId={toolId} formats={formats} features={[]} hideDrop live>
      <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void open(e.dataTransfer.files) }}
        className="mt-8 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-14 text-center transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]">
        <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]"><Upload className="size-5" aria-hidden /></div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{busy ? r('loading') : r('drop')}</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">{hint}</p>
        {err && <p className="text-xs text-red-500">{r('error')}</p>}
      </div>
      <input ref={input} type="file" multiple={multiple} accept={formats.map((f) => '.' + f.toLowerCase()).join(',')} className="sr-only" tabIndex={-1} onChange={(e) => { if (e.target.files) void open(e.target.files); e.target.value = '' }} />
    </PlannedTool>
  )
}

export const CloseBtn = ({ onClick }: { onClick: () => void }) => { const r = useR(); return <TB title={r('close')} onClick={onClick}><X className="size-4" />{r('close')}</TB> }
