import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <Link to="/" className="mt-6 inline-block text-accent hover:underline">
        {t('notFound.back')}
      </Link>
    </div>
  )
}
