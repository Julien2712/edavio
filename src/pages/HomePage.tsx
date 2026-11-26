import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  FileSpreadsheet,
  FileText,
  FileType2,
  Lock,
  Presentation,
  Sparkles,
  Upload,
  WifiOff,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ToolCard {
  id: string
  nameKey: string
  descriptionKey: string
  badge?: string
  color: string
  iconBg: string
  icon: React.ElementType
  route: string
  accept: string | null
  available: boolean
  features: string[]
}

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS: ToolCard[] = [
  {
    id: 'pdf',
    nameKey: 'tools.pdfEditor.name',
    descriptionKey: 'tools.pdfEditor.description',
    color: 'from-indigo-500 to-violet-600',
    iconBg: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
    icon: FileText,
    route: '/pdf/edit',
    accept: 'application/pdf,.pdf',
    available: true,
    features: ['home.pdf.feat1', 'home.pdf.feat2', 'home.pdf.feat3'],
  },
  {
    id: 'docs',
    nameKey: 'tools.documentEditor.name',
    descriptionKey: 'tools.documentEditor.description',
    badge: 'home.comingSoon',
    color: 'from-sky-500 to-blue-600',
    iconBg: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
    icon: FileType2,
    route: '/documents/edit',
    accept: '.doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    available: false,
    features: ['home.docs.feat1', 'home.docs.feat2', 'home.docs.feat3'],
  },
  {
    id: 'excel',
    nameKey: 'tools.spreadsheetEditor.name',
    descriptionKey: 'tools.spreadsheetEditor.description',
    badge: 'home.comingSoon',
    color: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
    icon: FileSpreadsheet,
    route: '/spreadsheets/edit',
    accept: '.xls,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    available: false,
    features: ['home.excel.feat1', 'home.excel.feat2', 'home.excel.feat3'],
  },
  {
    id: 'ppt',
    nameKey: 'tools.presentationEditor.name',
    descriptionKey: 'tools.presentationEditor.description',
    badge: 'home.comingSoon',
    color: 'from-orange-500 to-red-500',
    iconBg: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400',
    icon: Presentation,
    route: '/presentations/edit',
    accept: '.ppt,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    available: false,
    features: ['home.ppt.feat1', 'home.ppt.feat2', 'home.ppt.feat3'],
  },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

function HeroBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
      <Icon className="size-3.5 shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
      {label}
    </span>
  )
}

function ToolCardComponent({ tool }: { tool: ToolCard }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChosen = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''
      // Navigate to tool route — the tool page picks up the file via a custom
      // event so it can open it immediately without prop-drilling.
      const event = new CustomEvent('edavio:open-file', { detail: { file } })
      window.dispatchEvent(event)
      navigate(tool.route)
    },
    [navigate, tool.route],
  )

  const handleOpen = useCallback(() => {
    if (!tool.available) return
    fileInputRef.current?.click()
  }, [tool.available])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleOpen()
      }
    },
    [handleOpen],
  )

  const Icon = tool.icon

  return (
    <article
      role={tool.available ? 'button' : undefined}
      tabIndex={tool.available ? 0 : undefined}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={tool.available ? t('home.openTool', { tool: t(tool.nameKey) }) : undefined}
      className={cn(
        'group relative flex flex-col rounded-2xl border p-6 transition-all duration-200 select-none',
        tool.available
          ? 'cursor-pointer border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] hover:shadow-[var(--shadow-lg)]'
          : 'cursor-default border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] opacity-70',
      )}
    >
      {/* Top row: icon + badge */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex size-12 items-center justify-center rounded-xl transition-transform duration-200',
            tool.iconBg,
            tool.available && 'group-hover:scale-110',
          )}
        >
          <Icon className="size-6" aria-hidden />
        </div>

        {tool.badge && (
          <span className="rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            {t(tool.badge)}
          </span>
        )}
      </div>

      {/* Title + description */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{t(tool.nameKey)}</h2>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        {t(tool.descriptionKey)}
      </p>

      {/* Feature pills */}
      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Fonctionnalités">
        {tool.features.map((fk) => (
          <li
            key={fk}
            className="rounded-md bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]"
          >
            {t(fk)}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="mt-5 flex items-center gap-2">
        {tool.available ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-[var(--color-accent-hover)]">
              <Upload className="size-3.5" aria-hidden />
              {t('home.openFile')}
            </span>
            <span className="text-xs text-[var(--color-text-tertiary)] transition-opacity group-hover:opacity-100 opacity-0">
              {t('home.orDrop')}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-tertiary)]">
            {t('home.comingSoon')}
            <ArrowRight className="size-3.5" />
          </span>
        )}
      </div>

      {/* Gradient accent bar on hover */}
      {tool.available && (
        <span
          className={cn(
            'absolute inset-x-0 bottom-0 h-0.5 rounded-b-2xl bg-gradient-to-r opacity-0 transition-opacity duration-200 group-hover:opacity-100',
            tool.color,
          )}
          aria-hidden
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={tool.accept ?? undefined}
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileChosen}
      />
    </article>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">

      {/* ── Hero ── */}
      <section className="pt-20 pb-14 sm:pt-28">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-5xl">
            {t('home.title')}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            {t('home.subtitle')}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <HeroBadge icon={WifiOff} label={t('home.heroFeature1')} />
            <HeroBadge icon={Lock}    label={t('home.heroFeature2')} />
            <HeroBadge icon={Zap}     label={t('home.heroFeature3')} />
          </div>
        </div>
      </section>

      {/* ── Tool cards ── */}
      <section>
        <div className="mb-6 flex items-center gap-3">
          <Sparkles className="size-4 text-[var(--color-accent)]" aria-hidden />
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {t('home.chooseFormat')}
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <ToolCardComponent key={tool.id} tool={tool} />
          ))}
        </div>
      </section>

      {/* ── Footer note ── */}
      <p className="mt-10 text-center text-xs text-[var(--color-text-disabled)]">
        {t('home.privacyNote')}
      </p>
    </div>
  )
}
