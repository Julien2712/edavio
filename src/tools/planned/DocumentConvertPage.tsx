import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DisabledRun, OptionCard, PlannedTool } from './PlannedTool'

const PAIRS: [string, string][] = [
  ['DOCX', 'PDF'],
  ['PDF', 'DOCX'],
  ['XLSX', 'PDF'],
  ['PPTX', 'PDF'],
  ['PDF', 'PNG / JPG'],
  ['TXT / MD', 'PDF'],
  ['HTML', 'PDF'],
]

export default function DocumentConvertPage() {
  const { t } = useTranslation()
  return (
    <PlannedTool
      toolId="document-converter"
      formats={['PDF', 'DOCX', 'XLSX', 'PPTX', 'TXT', 'MD', 'HTML']}
      features={t('planned.doc.features', { returnObjects: true }) as string[]}
    >
      <OptionCard title={t('planned.doc.pairs')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAIRS.map(([from, to], i) => (
            <div
              key={`${from}-${to}`}
              className={
                i === 0
                  ? 'flex cursor-not-allowed items-center justify-center gap-3 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-light)] py-2.5 text-sm font-medium text-[var(--color-accent)]'
                  : 'flex cursor-not-allowed items-center justify-center gap-3 rounded-lg border border-[var(--color-border)] py-2.5 text-sm text-[var(--color-text-secondary)]'
              }
            >
              {from}
              <ArrowRight className="size-3.5 opacity-60" />
              {to}
            </div>
          ))}
        </div>
        <DisabledRun label={t('planned.run')} />
      </OptionCard>
    </PlannedTool>
  )
}
