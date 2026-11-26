import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  FileSpreadsheet,
  FileText,
  FileType2,
  Presentation,
  Upload,
} from 'lucide-react'
import { ACCEPTED_DOCUMENT_EXTENSIONS } from '@/tools/document/docFormats'
import { cn } from '@/lib/utils'

// ── Tool definitions ───────────────────────────────────────────────────────────

interface EditTool {
  id: string
  nameKey: string
  descriptionKey: string
  extensionLabel: string
  color: string
  iconBg: string
  borderHover: string
  icon: React.ElementType
  route: string
  accept: string
  available: boolean
  features: string[]
}

const EDIT_TOOLS: EditTool[] = [
  {
    id: 'pdf',
    nameKey: 'tools.pdfEditor.name',
    descriptionKey: 'tools.pdfEditor.description',
    extensionLabel: 'PDF',
    color: 'from-indigo-500 to-violet-600',
    iconBg: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-400',
    borderHover: 'hover:border-[var(--color-text-tertiary)]',
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
    extensionLabel: 'DOCX · TXT · MD · HTML',
    color: 'from-sky-500 to-blue-600',
    iconBg: 'bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-400',
    borderHover: 'hover:border-[var(--color-text-tertiary)]',
    icon: FileType2,
    route: '/documents/edit',
    accept: ACCEPTED_DOCUMENT_EXTENSIONS,
    available: true,
    features: ['home.docs.feat1', 'home.docs.feat2', 'home.docs.feat3'],
  },
  {
    id: 'excel',
    nameKey: 'tools.spreadsheetEditor.name',
    descriptionKey: 'tools.spreadsheetEditor.description',
    extensionLabel: 'XLSX · XLS',
    color: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-400',
    borderHover: 'hover:border-emerald-400',
    icon: FileSpreadsheet,
    route: '/spreadsheets/edit',
    accept: '.xls,.xlsx',
    available: false,
    features: ['home.excel.feat1', 'home.excel.feat2', 'home.excel.feat3'],
  },
  {
    id: 'ppt',
    nameKey: 'tools.presentationEditor.name',
    descriptionKey: 'tools.presentationEditor.description',
    extensionLabel: 'PPTX · PPT',
    color: 'from-orange-500 to-red-500',
    iconBg: 'bg-orange-100 text-orange-600 dark:bg-orange-900/60 dark:text-orange-400',
    borderHover: 'hover:border-orange-400',
    icon: Presentation,
    route: '/presentations/edit',
    accept: '.ppt,.pptx',
    available: false,
    features: ['home.ppt.feat1', 'home.ppt.feat2', 'home.ppt.feat3'],
  },
]

// ── Tool card ──────────────────────────────────────────────────────────────────

function EditToolCard({ tool }: { tool: EditTool }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChosen = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''
      navigate(tool.route, { state: { file } })
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
      className={cn(
        'group relative flex flex-col rounded-2xl border p-6 transition-all duration-200 select-none',
        tool.available
          ? cn('cursor-pointer border-[var(--color-border)] bg-[var(--color-surface)]', tool.borderHover, 'hover:shadow-[var(--shadow-lg)]')
          : 'cursor-default border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] opacity-65',
      )}
    >
      {/* Top row */}
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
        <span className="rounded-md bg-[var(--color-surface-sunken)] px-2 py-1 font-mono text-[11px] font-medium text-[var(--color-text-tertiary)]">
          {tool.extensionLabel}
        </span>
      </div>

      {/* Title + description */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{t(tool.nameKey)}</h2>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        {t(tool.descriptionKey)}
      </p>

      {/* Feature pills */}
      <ul className="mt-4 flex flex-wrap gap-1.5">
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
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {tool.available ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-[var(--color-accent-hover)]">
              <Upload className="size-3.5" aria-hidden />
              {t('home.openFile')}
            </span>
            {tool.id === 'docs' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(tool.route, { state: { newBlank: true } })
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
              >
                {t('tools.documentEditor.newBlank')}
              </button>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-tertiary)]">
            {t('home.comingSoon')}
            <ArrowRight className="size-3.5" />
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={tool.accept}
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileChosen}
      />
    </article>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function EditPage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <section className="pt-14 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          {t('sections.edit')}
        </h1>
        <p className="mt-3 text-base text-[var(--color-text-secondary)]">
          {t('home.sections.editHint')}
        </p>
      </section>

      <section>
        <div className="grid gap-4 sm:grid-cols-2">
          {EDIT_TOOLS.map((tool) => (
            <EditToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </section>
    </div>
  )
}
