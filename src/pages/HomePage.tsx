import { ToolRegistry } from '@/tools'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  FilePlus2,
  FileOutput,
  FolderOpen,
  Sparkles,
  FileSpreadsheet,
  FileText,
  FileType2,
  Images,
  Lock,
  Minimize2,
  Presentation,
  WifiOff,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Static section definitions ─────────────────────────────────────────────────

interface SectionTool {
  nameKey: string
  descriptionKey: string
  icon: React.ElementType
  iconBg: string
  route: string
  available: boolean
}

interface HomeSection {
  id: string
  titleKey: string
  subtitleKey: string
  accentColor: string
  headerBg: string
  headerText: string
  route: string
  tools: SectionTool[]
}

const SECTIONS: HomeSection[] = [
  {
    id: 'create',
    titleKey: 'sections.create',
    subtitleKey: 'home.sections.createHint',
    accentColor: 'from-fuchsia-500 to-pink-600',
    headerBg: 'bg-fuchsia-50 dark:bg-fuchsia-950/60',
    headerText: 'text-fuchsia-600 dark:text-fuchsia-400',
    route: '/create',
    tools: [
      { nameKey: 'createPage.pdf.title', descriptionKey: 'createPage.pdf.f2', icon: FileText, iconBg: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-400', route: '/create', available: true },
      { nameKey: 'createPage.docs.title', descriptionKey: 'createPage.docs.f1', icon: FileType2, iconBg: 'bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-400', route: '/create', available: true },
      { nameKey: 'createPage.excel.title', descriptionKey: 'createPage.excel.f1', icon: FileSpreadsheet, iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-400', route: '/create', available: true },
      { nameKey: 'createPage.ppt.title', descriptionKey: 'createPage.ppt.f1', icon: Presentation, iconBg: 'bg-orange-100 text-orange-600 dark:bg-orange-900/60 dark:text-orange-400', route: '/create', available: true },
    ],
  },
  {
    id: 'edit',
    titleKey: 'sections.edit',
    subtitleKey: 'home.sections.editHint',
    accentColor: 'from-indigo-500 to-violet-600',
    headerBg: 'bg-indigo-50 dark:bg-indigo-950/60',
    headerText: 'text-indigo-600 dark:text-indigo-400',
    route: '/edit',
    tools: [
      {
        nameKey: 'tools.pdfEditor.name',
        descriptionKey: 'tools.pdfEditor.description',
        icon: FileText,
        iconBg: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-400',
        route: '/edit',
        available: true,
      },
      {
        nameKey: 'tools.documentEditor.name',
        descriptionKey: 'tools.documentEditor.description',
        icon: FileType2,
        iconBg: 'bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-400',
        route: '/edit',
        available: true,
      },
      {
        nameKey: 'tools.spreadsheetEditor.name',
        descriptionKey: 'tools.spreadsheetEditor.description',
        icon: FileSpreadsheet,
        iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-400',
        route: '/edit',
        available: true,
      },
      {
        nameKey: 'tools.presentationEditor.name',
        descriptionKey: 'tools.presentationEditor.description',
        icon: Presentation,
        iconBg: 'bg-orange-100 text-orange-600 dark:bg-orange-900/60 dark:text-orange-400',
        route: '/presentations/edit',
        available: true,
      },
    ],
  },
  {
    id: 'read',
    titleKey: 'sections.read',
    subtitleKey: 'home.sections.readHint',
    accentColor: 'from-sky-500 to-blue-600',
    headerBg: 'bg-sky-50 dark:bg-sky-950/60',
    headerText: 'text-sky-600 dark:text-sky-400',
    route: '/read',
    tools: [
      {
        nameKey: 'tools.documentReader.name',
        descriptionKey: 'tools.documentReader.description',
        icon: BookOpen,
        iconBg: 'bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-400',
        route: '/read',
        available: false,
      },
    ],
  },
  {
    id: 'compress',
    titleKey: 'sections.compress',
    subtitleKey: 'home.sections.compressHint',
    accentColor: 'from-emerald-500 to-teal-600',
    headerBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    headerText: 'text-emerald-600 dark:text-emerald-400',
    route: '/compress',
    tools: [
      {
        nameKey: 'tools.pdfCompressor.name',
        descriptionKey: 'tools.pdfCompressor.description',
        icon: Minimize2,
        iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-400',
        route: '/compress',
        available: false,
      },
    ],
  },
  {
    id: 'convert',
    titleKey: 'sections.convert',
    subtitleKey: 'home.sections.convertHint',
    accentColor: 'from-orange-500 to-red-500',
    headerBg: 'bg-orange-50 dark:bg-orange-950/60',
    headerText: 'text-orange-600 dark:text-orange-400',
    route: '/convert/documents',
    tools: [
      {
        nameKey: 'tools.imageConverter.name',
        descriptionKey: 'tools.imageConverter.description',
        icon: Images,
        iconBg: 'bg-orange-100 text-orange-600 dark:bg-orange-900/60 dark:text-orange-400',
        route: '/convert/images',
        available: false,
      },
      {
        nameKey: 'tools.documentConverter.name',
        descriptionKey: 'tools.documentConverter.description',
        icon: FileOutput,
        iconBg: 'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-400',
        route: '/convert/documents',
        available: false,
      },
    ],
  },
]

const SECTION_ICON_BG: Record<string, string> = {
  read: 'bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-400',
  compress: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-400',
  convert: 'bg-orange-100 text-orange-600 dark:bg-orange-900/60 dark:text-orange-400',
}
for (const sec of SECTIONS) {
  if (!SECTION_ICON_BG[sec.id]) continue
  sec.tools = ToolRegistry.list()
    .filter((tool) => tool.section === sec.id && tool.component)
    .map((tool) => ({ nameKey: tool.nameKey, descriptionKey: tool.descriptionKey, icon: tool.icon, iconBg: SECTION_ICON_BG[sec.id]!, route: tool.route, available: tool.status === 'available' }))
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HeroBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
      <Icon className="size-3.5 shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
      {label}
    </span>
  )
}

function SectionCard({ section }: { section: HomeSection }) {
  const { t } = useTranslation()

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      {/* Section header */}
      <div className={cn('px-5 py-4', section.headerBg)}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={cn('text-base font-semibold', section.headerText)}>
              {t(section.titleKey)}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              {t(section.subtitleKey)}
            </p>
          </div>
          <Link
            to={section.route}
            className={cn(
              'shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-white/70 hover:bg-white dark:bg-black/30 dark:hover:bg-black/50',
              section.headerText,
            )}
          >
            {t('home.seeAll')}
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* Tool list */}
      <ul className="divide-y divide-[var(--color-border-subtle)]">
        {section.tools.map((tool) => {
          const Icon = tool.icon
          const content = (
            <li className={cn(
              'flex items-center gap-4 px-5 py-3.5 transition-colors',
              tool.available
                ? 'hover:bg-[var(--color-surface-raised)] cursor-pointer'
                : 'opacity-60 cursor-default',
            )}>
              <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tool.iconBg)}>
                <Icon className="size-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                  {t(tool.nameKey)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] truncate">
                  {t(tool.descriptionKey)}
                </p>
              </div>
              {tool.available ? (
                <ArrowRight className="size-4 shrink-0 text-[var(--color-text-tertiary)]" />
              ) : (
                <span className="shrink-0 rounded-full bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-disabled)]">
                  {t('home.comingSoon')}
                </span>
              )}
            </li>
          )

          return tool.available ? (
            <Link key={tool.nameKey} to={tool.route} className="block">
              {content}
            </Link>
          ) : (
            <div key={tool.nameKey}>{content}</div>
          )
        })}
      </ul>
    </div>
  )
}

const QUICK = [
  { key: 'pdf', icon: FileText, route: '/pdf/edit', color: 'from-indigo-500 to-violet-600', label: 'PDF' },
  { key: 'docs', icon: FileType2, route: '/documents/edit', color: 'from-sky-500 to-blue-600', label: 'Document' },
  { key: 'excel', icon: FileSpreadsheet, route: '/spreadsheets/edit', color: 'from-emerald-500 to-teal-600', label: 'Tableur' },
  { key: 'ppt', icon: Presentation, route: '/presentations/edit', color: 'from-orange-500 to-rose-500', label: 'Présentation' },
] as const

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">

      {/* ── Hero ── */}
      <section className="relative pt-16 pb-10 sm:pt-24">
        <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,var(--color-accent-light),transparent_65%)] opacity-80" />
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] shadow-sm">
            <Sparkles className="size-3.5 text-[var(--color-accent)]" aria-hidden />
            {t('home.badge')}
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-5xl">
            {t('home.title')}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            {t('home.subtitle')}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/create" className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90">
              <FilePlus2 className="size-4" aria-hidden />
              {t('home.newDocument')}
            </Link>
            <Link to="/edit" className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-raised)]">
              <FolderOpen className="size-4" aria-hidden />
              {t('home.openFile')}
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <HeroBadge icon={WifiOff} label={t('home.heroFeature1')} />
            <HeroBadge icon={Lock}    label={t('home.heroFeature2')} />
            <HeroBadge icon={Zap}     label={t('home.heroFeature3')} />
          </div>
        </div>
      </section>

      {/* ── Quick start ── */}
      <section className="pb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">{t('home.quickStart')}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK.map((q) => {
            const Icon = q.icon
            return (
              <button key={q.key} type="button" onClick={() => navigate(q.route, { state: { newBlank: true } })}
                className="group flex flex-col items-start gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:shadow-md">
                <span className={cn('flex size-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', q.color)}><Icon className="size-5" aria-hidden /></span>
                <span>
                  <span className="block text-sm font-semibold text-[var(--color-text-primary)]">{t(`home.quick.${q.key}`)}</span>
                  <span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">{t('home.quickBlank')}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Sections grid ── */}
      <section>
        <div className="grid gap-5 md:grid-cols-2">
          {SECTIONS.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-[var(--color-text-disabled)]">
        {t('home.privacyNote')}
      </p>
    </div>
  )
}
