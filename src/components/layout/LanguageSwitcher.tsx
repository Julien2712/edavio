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
        <Button variant="ghost" size="icon" aria-label={t('nav.language')}>
          <Languages className="size-5" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-md border border-neutral-200 bg-white p-1 shadow-md dark:border-neutral-800 dark:bg-neutral-900"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <DropdownMenu.Item
              key={lang.code}
              onSelect={() => void i18n.changeLanguage(lang.code)}
              className="flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm outline-none data-highlighted:bg-neutral-100 dark:data-highlighted:bg-neutral-800"
            >
              {lang.label}
              {current === lang.code && <Check className="size-4" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
