import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ToolRegistry } from '@/tools'
import { cn } from '@/lib/utils'

export default function HomePage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-20">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('home.title')}</h1>
        <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-400">{t('home.subtitle')}</p>
      </div>

      <h2 className="mt-14 text-sm font-medium uppercase tracking-wide text-neutral-500">
        {t('home.tools')}
      </h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ToolRegistry.list().map((tool) => {
          const available = tool.status === 'available'
          const card = (
            <div
              className={cn(
                'flex h-full flex-col rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900',
                available
                  ? 'transition-colors hover:border-accent'
                  : 'opacity-60',
              )}
            >
              <tool.icon className="size-6 text-accent" aria-hidden />
              <h3 className="mt-4 font-medium">{t(tool.nameKey)}</h3>
              <p className="mt-1 flex-1 text-sm text-neutral-600 dark:text-neutral-400">
                {t(tool.descriptionKey)}
              </p>
              <span className="mt-4 text-sm font-medium text-accent">
                {available ? t('home.open') : <span className="text-neutral-500">{t('home.comingSoon')}</span>}
              </span>
            </div>
          )
          return (
            <li key={tool.id}>
              {available ? (
                <Link to={tool.route} className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-accent">
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
