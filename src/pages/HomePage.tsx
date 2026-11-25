import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ToolRegistry } from '@/tools'
import { cn } from '@/lib/utils'
import { ArrowRight, Lock, Wifi, User } from 'lucide-react'

function HeroFeature({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
      <div className="flex size-6 items-center justify-center rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]">
        <Icon className="size-3.5 text-[var(--color-accent)]" aria-hidden />
      </div>
      {label}
    </div>
  )
}

export default function HomePage() {
  const { t } = useTranslation()
  const tools = ToolRegistry.list()

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      {/* ── Hero ── */}
      <section className="pt-16 pb-14 sm:pt-24">
        <div className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] px-3.5 py-1 text-xs font-medium text-[var(--color-brand-700)]"
            style={{ background: 'var(--color-accent-light)', borderColor: 'var(--color-brand-200)', color: 'var(--color-accent)' }}>
            <Lock className="size-3" />
            {t('privacy.localShort')}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-5xl lg:text-6xl">
            {t('home.title')}
          </h1>
          <p className="mt-5 text-lg text-[var(--color-text-secondary)] leading-relaxed">
            {t('home.subtitle')}
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap gap-3">
            <HeroFeature icon={Wifi} label={t('home.heroFeature1')} />
            <HeroFeature icon={User} label={t('home.heroFeature2')} />
            <HeroFeature icon={Lock} label={t('home.heroFeature3')} />
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="mb-6 flex items-center gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">
          {t('home.tools')}
        </h2>
        <div className="flex-1 border-t border-[var(--color-border-subtle)]" />
      </div>

      {/* ── Tool grid ── */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((tool) => {
          const available = tool.status === 'available'
          const card = (
            <div
              className={cn(
                'group relative flex h-full flex-col rounded-2xl border p-5 transition-all duration-200',
                available
                  ? 'border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm hover:border-[var(--color-accent)] hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] opacity-60 cursor-default',
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  'mb-4 inline-flex size-11 items-center justify-center rounded-xl border',
                  available
                    ? 'border-[var(--color-brand-200)] bg-[var(--color-accent-light)] text-[var(--color-accent)] group-hover:bg-[var(--color-accent)] group-hover:text-white group-hover:border-[var(--color-accent)] transition-colors'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-text-disabled)]',
                )}
              >
                <tool.icon className="size-5" aria-hidden />
              </div>

              <h3 className="font-semibold text-[var(--color-text-primary)]">{t(tool.nameKey)}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {t(tool.descriptionKey)}
              </p>

              {/* CTA */}
              <div className="mt-5">
                {available ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)] group-hover:gap-2.5 transition-all">
                    {t('home.open')}
                    <ArrowRight className="size-3.5" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 py-0.5 text-xs text-[var(--color-text-tertiary)]">
                    {t('home.comingSoon')}
                  </span>
                )}
              </div>
            </div>
          )

          return (
            <li key={tool.id}>
              {available ? (
                <Link to={tool.route} className="block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">
                  {card}
                </Link>
              ) : (
                card
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
