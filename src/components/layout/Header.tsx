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
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-5 px-4 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-[var(--color-text-primary)] transition-opacity hover:opacity-70"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-[var(--color-text-primary)] text-[13px] font-bold leading-none text-[var(--color-surface)]">
            E
          </span>
          <span className="text-sm font-semibold tracking-tight">{t('app.name')}</span>
        </Link>

        <span className="h-4 w-px bg-[var(--color-border)]" aria-hidden />

        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto" aria-label="Tools">
          {available.map((tool) => (
            <NavLink
              key={tool.id}
              to={tool.route}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] transition-colors',
                  isActive
                    ? 'bg-[var(--color-surface-sunken)] font-medium text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                )
              }
            >
              <tool.icon className="size-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{t(tool.nameKey)}</span>
            </NavLink>
          ))}
        </nav>

        <span
          className="hidden shrink-0 items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] md:inline-flex"
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
