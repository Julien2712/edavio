import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      {/* Big 404 */}
      <p className="select-none text-8xl font-bold tracking-tighter text-[var(--color-border)] sm:text-9xl">
        404
      </p>
      <h1 className="mt-6 text-2xl font-semibold text-[var(--color-text-primary)]">
        {t('notFound.title')}
      </h1>
      <p className="mt-2 text-[var(--color-text-secondary)]">{t('notFound.subtitle')}</p>
      <Button asChild variant="primary" size="md" className="mt-8 gap-2">
        <Link to="/">
          <Home className="size-4" />
          {t('notFound.back')}
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="mt-3">
        <Link to="/">
          <ArrowLeft className="size-3.5" />
          Go back
        </Link>
      </Button>
    </div>
  )
}
