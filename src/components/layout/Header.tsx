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
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        {/* Logo */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight text-[var(--color-text-primary)] hover:opacity-80 transition-opacity"
        >
          <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--color-accent)] shadow-sm">
            <img
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt=""
              className="size-4 brightness-0 invert"
            />
          </div>
          <span className="text-sm font-bold">{t('app.name')}</span>
        </Link>

        {/* Tool nav */}
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto" aria-label="Tools">
          {available.map((tool) => (
            <NavLink
              key={tool.id}
              to={tool.route}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]',
                )
              }
            >
              <tool.icon className="size-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{t(tool.nameKey)}</span>
            </NavLink>
          ))}
        </nav>

        {/* Privacy badge */}
        <span
          className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1 text-xs text-[var(--color-text-tertiary)] md:inline-flex"
          title={t('privacy.local')}
        >
          <Lock className="size-3 shrink-0" aria-hidden />
          {t('privacy.localShort')}
        </span>

        <LanguageSwitcher />
      </div>
    </header>
  )
}
