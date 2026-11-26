import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DisabledRun, OptionCard, PlannedTool, Toggle } from './PlannedTool'

const FORMATS = ['JPG', 'PNG', 'WebP', 'AVIF', 'GIF', 'BMP', 'ICO']

export default function ImageConvertPage() {
  const { t } = useTranslation()
  return (
    <PlannedTool
      toolId="image-converter"
      formats={['PNG', 'JPG', 'WebP', 'AVIF', 'GIF', 'BMP']}
      features={t('planned.image.features', { returnObjects: true }) as string[]}
    >
      <OptionCard title={t('planned.image.format')}>
        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map((f, i) => (
            <span
              key={f}
              className={cn(
                'cursor-not-allowed rounded-lg border px-3 py-1.5 text-sm',
                i === 0
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]',
              )}
            >
              {f}
            </span>
          ))}
        </div>
        <div className="mt-5">
          <div className="mb-2 flex justify-between text-sm text-[var(--color-text-secondary)]">
            <span>{t('planned.image.quality')}</span>
            <span className="tabular-nums text-[var(--color-text-tertiary)]">85%</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-[var(--color-border)]">
            <div className="h-full w-[85%] rounded-full bg-[var(--color-accent)]/40" />
            <div className="absolute left-[85%] top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-accent)]/50 bg-[var(--color-surface)]" />
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <Toggle label={t('planned.image.resize')} />
          <Toggle label={t('planned.image.batch')} on />
        </div>
        <DisabledRun label={t('planned.run')} />
      </OptionCard>
    </PlannedTool>
  )
}
