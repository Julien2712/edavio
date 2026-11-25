import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'

export default function PdfEditorPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t('tools.pdfEditor.name')}</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">{t('tools.pdfEditor.placeholder')}</p>
      <p className="mt-8 inline-flex items-center gap-2 text-sm text-neutral-500">
        <Lock className="size-4" aria-hidden />
        {t('privacy.local')}
      </p>
    </div>
  )
}
