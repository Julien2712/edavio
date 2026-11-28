import type { ReactNode } from 'react'
import { ArrowLeft, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ToolRegistry } from '@/core/tools/registry'
import { cn } from '@/lib/utils'

/** Shared frame of the tools whose interface exists but whose features come later. */
export function PlannedTool({
  toolId,
  formats,
  features,
  children,
  hideDrop,
  live,
}: {
  toolId: string
  formats: string[]
  features: string[]
  children?: ReactNode
  hideDrop?: boolean
  /** the tool is functional: no "coming soon" badge, notice or roadmap */
  live?: boolean
}) {
  const { t } = useTranslation()
  const tool = ToolRegistry.get(toolId)
  if (!tool) return null
  const siblings = ToolRegistry.list().filter((x) => x.section === tool.section && x.component)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
      >
        <ArrowLeft className="size-3.5" />
        {t('planned.back')}
      </Link>

      {siblings.length > 1 && (
        <nav className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={t(`sections.${tool.section}`)}>
          {siblings.map((x) => (
            <Link key={x.id} to={x.route} aria-current={x.id === tool.id ? 'page' : undefined}
              className={cn('flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm transition-all', x.id === tool.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)] shadow-sm ring-1 ring-[var(--color-accent)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]')}>
              <x.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{t(x.nameKey)}</span>
            </Link>
          ))}
        </nav>
      )}

      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] text-[var(--color-accent)]">
          <tool.icon className="size-5" aria-hidden />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
              {t(tool.nameKey)}
            </h1>
            {!live && (
              <span className="rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('planned.badge')}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{t(tool.descriptionKey)}</p>
        </div>
      </div>

      {!hideDrop && (
        <div
          aria-disabled
          className="mt-8 flex cursor-not-allowed flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] px-6 py-12 text-center"
        >
          <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]">
            <Upload className="size-5" aria-hidden />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{t('planned.dropTitle')}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">{t('planned.dropHint')}</p>
          <div className="mt-1 flex flex-wrap justify-center gap-1.5">
            {formats.map((f) => (
              <span
                key={f}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {children}

      {!live && (
      <div className="mt-8 rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--color-text-tertiary)]">
          {t('planned.planned')}
        </h2>
        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-[var(--color-border-subtle)] pt-4 text-xs text-[var(--color-text-tertiary)]">
          {t('planned.notice')}
        </p>
      </div>
      )}
    </div>
  )
}

/** Disabled primary action, same look as the final one. */
export function DisabledRun({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--color-accent)] px-5 text-sm font-medium text-white opacity-40"
    >
      {label}
    </button>
  )
}

export function OptionCard({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mt-6 rounded-xl border border-[var(--color-border)] p-5', className)}>
      <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-[var(--color-text-tertiary)]">
        {title}
      </h2>
      {children}
    </div>
  )
}

export function Toggle({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <label className="flex cursor-not-allowed items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
      {label}
      <span
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          on ? 'bg-[var(--color-accent)]/50' : 'bg-[var(--color-border)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-sm',
            on ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </label>
  )
}
