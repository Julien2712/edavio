import { Home, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { TOOL_SECTIONS } from '@/core/tools/types'
import { ToolRegistry } from '@/tools'
import { cn } from '@/lib/utils'
import { LanguageSwitcher } from './LanguageSwitcher'

export function Header() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-5 px-4 sm:px-6">
        <Link
          to="/"
          aria-label={t('app.name')}
          title={t('app.name')}
          className={cn(
            'shrink-0 rounded-md p-1.5 transition-colors',
            pathname === '/'
              ? 'bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          )}
        >
          <Home className="size-4" aria-hidden />
        </Link>

        <span className="h-4 w-px bg-[var(--color-border)]" aria-hidden />

        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto" aria-label="Sections">
          {TOOL_SECTIONS.map((section) => {
            const tools = ToolRegistry.list().filter((tool) => tool.section === section && tool.component)
            const first = tools[0]
            if (section !== 'create' && !first) return null
            const to = section === 'create' ? '/create' : section === 'edit' ? '/edit' : first!.route
            const active =
              (section === 'create' && pathname.startsWith('/create')) ||
              (section === 'edit' && pathname.startsWith('/edit')) ||
              tools.some((tool) => pathname.startsWith(tool.route))
            return (
              <Link
                key={section}
                to={to}
                className={cn(
                  'whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] transition-colors',
                  active
                    ? 'bg-[var(--color-surface-sunken)] font-medium text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {t(`sections.${section}`)}
              </Link>
            )
          })}
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
