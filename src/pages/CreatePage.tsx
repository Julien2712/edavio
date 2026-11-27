import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FileType2,
  Presentation,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreateOption {
  id: string
  titleKey: string
  descriptionKey: string
  badge: string
  iconBg: string
  icon: React.ElementType
  route: string
  state?: Record<string, unknown>
  features: string[]
}

const CREATE_OPTIONS: CreateOption[] = [
  {
    id: 'pdf',
    titleKey: 'createPage.pdf.title',
    descriptionKey: 'createPage.pdf.description',
    badge: 'PDF',
    iconBg: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-400',
    icon: FileText,
    route: '/pdf/edit',
    state: { newBlank: true },
    features: ['createPage.pdf.f1', 'createPage.pdf.f2', 'createPage.pdf.f3'],
  },
  {
    id: 'docs',
    titleKey: 'createPage.docs.title',
    descriptionKey: 'createPage.docs.description',
    badge: 'DOCX · MD · TXT',
    iconBg: 'bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-400',
    icon: FileType2,
    route: '/documents/edit',
    state: { newBlank: true },
    features: ['createPage.docs.f1', 'createPage.docs.f2', 'createPage.docs.f3'],
  },
  {
    id: 'excel',
    titleKey: 'createPage.excel.title',
    descriptionKey: 'createPage.excel.description',
    badge: 'XLSX · CSV',
    iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-400',
    icon: FileSpreadsheet,
    route: '/spreadsheets/edit',
    state: { newBlank: true },
    features: ['createPage.excel.f1', 'createPage.excel.f2', 'createPage.excel.f3'],
  },
  {
    id: 'ppt',
    titleKey: 'createPage.ppt.title',
    descriptionKey: 'createPage.ppt.description',
    badge: 'PPTX',
    iconBg: 'bg-orange-100 text-orange-600 dark:bg-orange-900/60 dark:text-orange-400',
    icon: Presentation,
    route: '/presentations/edit',
    state: { newBlank: true },
    features: ['createPage.ppt.f1', 'createPage.ppt.f2', 'createPage.ppt.f3'],
  },
]

export default function CreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <section className="pt-14 pb-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
          <Sparkles className="size-3.5 text-[var(--color-accent)]" aria-hidden />
          {t('createPage.badge')}
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          {t('createPage.title')}
        </h1>
        <p className="mt-3 max-w-2xl text-base text-[var(--color-text-secondary)]">
          {t('createPage.subtitle')}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {CREATE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => navigate(opt.route, { state: opt.state })}
              className="group flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-left transition-all duration-200 hover:border-[var(--color-text-tertiary)] hover:shadow-[var(--shadow-lg)]"
            >
              <div className="mb-5 flex w-full items-start justify-between gap-3">
                <div
                  className={cn(
                    'flex size-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110',
                    opt.iconBg,
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                </div>
                <span className="rounded-md bg-[var(--color-surface-sunken)] px-2 py-1 font-mono text-[11px] font-medium text-[var(--color-text-tertiary)]">
                  {opt.badge}
                </span>
              </div>

              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {t(opt.titleKey)}
              </h2>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {t(opt.descriptionKey)}
              </p>

              <ul className="mt-4 flex flex-wrap gap-1.5">
                {opt.features.map((fk) => (
                  <li
                    key={fk}
                    className="rounded-md bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]"
                  >
                    {t(fk)}
                  </li>
                ))}
              </ul>

              <div className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-[var(--color-accent-hover)]">
                <FilePlus2 className="size-3.5" aria-hidden />
                {t('createPage.cta')}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          )
        })}
      </section>
    </div>
  )
}
