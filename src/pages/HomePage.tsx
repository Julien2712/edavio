import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ToolRegistry } from '@/tools'
import { cn } from '@/lib/utils'
import { ArrowRight, Lock, Wifi, User } from 'lucide-react'

function HeroFeature({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
      <Icon className="size-3.5 text-[var(--color-text-tertiary)]" aria-hidden />
      {label}
    </div>
  )
}

export default function HomePage() {
  const { t } = useTranslation()
  const tools = ToolRegistry.list()

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
      <section className="pt-20 pb-16 sm:pt-28">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-5xl">
            {t('home.title')}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-[var(--color-text-secondary)]">
            {t('home.subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            <HeroFeature icon={Wifi} label={t('home.heroFeature1')} />
            <HeroFeature icon={User} label={t('home.heroFeature2')} />
            <HeroFeature icon={Lock} label={t('home.heroFeature3')} />
          </div>
        </div>
      </section>

      <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-[var(--color-text-tertiary)]">
        {t('home.tools')}
      </h2>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const available = tool.status === 'available'
          const card = (
            <div
              className={cn(
                'group flex h-full flex-col rounded-xl border p-5 transition-colors',
                available
                  ? 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] opacity-60',
              )}
            >
              <div
                className={cn(
                  'mb-4 inline-flex size-9 items-center justify-center rounded-lg',
                  available
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-surface-sunken)] text-[var(--color-text-disabled)]',
                )}
              >
                <tool.icon className="size-[18px]" aria-hidden />
              </div>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t(tool.nameKey)}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {t(tool.descriptionKey)}
              </p>
              <div className="mt-4 text-xs">
                {available ? (
                  <span className="inline-flex items-center gap-1 font-medium text-[var(--color-accent)] transition-all group-hover:gap-2">
                    {t('home.open')}
                    <ArrowRight className="size-3.5" />
                  </span>
                ) : (
                  <span className="text-[var(--color-text-tertiary)]">{t('home.comingSoon')}</span>
                )}
              </div>
            </div>
          )

          return (
            <li key={tool.id}>
              {available ? (
                <Link to={tool.route} className="block h-full rounded-xl">
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
