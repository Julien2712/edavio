import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DisabledRun, OptionCard, PlannedTool, Toggle } from './PlannedTool'

export default function CompressPage() {
  const { t } = useTranslation()
  const levels = [
    { id: 'light', active: false },
    { id: 'balanced', active: true },
    { id: 'max', active: false },
  ]
  return (
    <PlannedTool
      toolId="pdf-compressor"
      formats={['PDF']}
      features={t('planned.compress.features', { returnObjects: true }) as string[]}
    >
      <OptionCard title={t('planned.compress.level')}>
        <div className="grid gap-2 sm:grid-cols-3">
          {levels.map((l) => (
            <div
              key={l.id}
              className={cn(
                'cursor-not-allowed rounded-lg border p-3',
                l.active
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'border-[var(--color-border)]',
              )}
            >
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{t(`planned.compress.${l.id}`)}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t(`planned.compress.${l.id}Hint`)}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-3">
          <Toggle label={t('planned.compress.downscale')} on />
          <Toggle label={t('planned.compress.metadata')} />
        </div>
        <div className="mt-5 space-y-2 border-t border-[var(--color-border-subtle)] pt-4 text-xs text-[var(--color-text-tertiary)]">
          <div className="flex items-center gap-3"><span className="w-28">{t('planned.compress.before')}</span><div className="h-2 flex-1 rounded bg-[var(--color-border)]" /></div>
          <div className="flex items-center gap-3"><span className="w-28">{t('planned.compress.after')}</span><div className="h-2 w-1/3 rounded bg-[var(--color-accent)]/40" /></div>
        </div>
        <DisabledRun label={t('planned.run')} />
      </OptionCard>
    </PlannedTool>
  )
}
