import { Minus, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PlannedTool } from './PlannedTool'

export default function ReaderPage() {
  const { t } = useTranslation()
  const tb = t('planned.reader.toolbar', { returnObjects: true }) as string[]
  return (
    <PlannedTool
      toolId="document-reader"
      formats={['PDF', 'DOCX', 'XLSX', 'PPTX', 'EPUB']}
      features={t('planned.reader.features', { returnObjects: true }) as string[]}
    >
      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border)] opacity-60">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
          <span className="inline-flex items-center gap-1.5"><Search className="size-3.5" />{tb[0]}</span>
          <span className="ml-auto inline-flex items-center gap-2"><Minus className="size-3.5" />{tb[1]}<Plus className="size-3.5" /></span>
          <span className="rounded-md bg-[var(--color-surface-sunken)] px-2 py-0.5">{tb[2]} 1 / 1</span>
        </div>
        <div className="flex h-56">
          <div className="hidden w-40 shrink-0 space-y-2 border-r border-[var(--color-border)] p-3 sm:block">
            <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-tertiary)]">{t('planned.reader.outline')}</p>
            {[70, 50, 60, 40].map((w) => (
              <div key={w} className="h-2 rounded bg-[var(--color-surface-sunken)]" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="flex flex-1 justify-center bg-[var(--color-surface-sunken)] p-5">
            <div className="w-40 space-y-2 rounded-sm bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)]">
              {[90, 100, 80, 95, 60].map((w, i) => (
                <div key={i} className="h-1.5 rounded bg-[var(--color-border)]" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </PlannedTool>
  )
}
