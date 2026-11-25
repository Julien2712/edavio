import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router-dom'
import { ToolRegistry } from '@/tools'
import { cn } from '@/lib/utils'
import { LanguageSwitcher } from './LanguageSwitcher'

export function Header() {
  const { t } = useTranslation()
  const available = ToolRegistry.list().filter((tool) => tool.status === 'available')

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-50/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-6" />
          {t('app.name')}
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto" aria-label="Tools">
          {available.map((tool) => (
            <NavLink
              key={tool.id}
              to={tool.route}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800',
                  isActive && 'bg-neutral-200/70 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100',
                )
              }
            >
              <tool.icon className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t(tool.nameKey)}</span>
            </NavLink>
          ))}
        </nav>

        <span
          className="hidden items-center gap-1.5 text-xs text-neutral-500 md:inline-flex"
          title={t('privacy.local')}
        >
          <Lock className="size-3.5" aria-hidden />
          {t('privacy.local')}
        </span>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
