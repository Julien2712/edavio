import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '@/core/i18n'
import { Button } from '@/components/ui/button'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = i18n.resolvedLanguage

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('nav.language')} className="shrink-0">
          <Languages className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg shadow-black/10 animate-in fade-in-0 zoom-in-95"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <DropdownMenu.Item
              key={lang.code}
              onSelect={() => void i18n.changeLanguage(lang.code)}
              className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors data-highlighted:bg-[var(--color-surface-raised)]"
            >
              <span>{lang.label}</span>
              {current === lang.code && (
                <Check className="size-3.5 text-[var(--color-accent)]" />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
