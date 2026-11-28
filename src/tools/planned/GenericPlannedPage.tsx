import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DisabledRun, OptionCard, PlannedTool, Toggle } from './PlannedTool'

interface Cfg {
  formats: string[]
  /** output formats (conversion tools) */
  outputs?: string[]
  /** compression level selector */
  levels?: boolean
  quality?: boolean
  toggles: string[]
}

const IMG = ['PNG', 'JPG', 'WebP', 'AVIF', 'GIF', 'SVG', 'TIFF', 'BMP', 'HEIC', 'ICO']
const CONFIG: Record<string, Cfg> = {
  'file-compressor': { formats: ['PDF', 'PNG', 'JPG', 'WebP', 'GIF', 'SVG', 'TIFF', 'DOCX', 'XLSX', 'PPTX', 'ODT', 'ZIP', 'MP4', 'MP3', 'TXT', 'JSON', 'CSV'], levels: true, toggles: ['batch', 'keepFormat', 'stripMeta', 'downscale'] },
  'image-compressor': { formats: ['JPG', 'PNG', 'WebP', 'AVIF', 'GIF', 'SVG', 'TIFF', 'BMP', 'HEIC'], levels: true, quality: true, toggles: ['batch', 'stripMeta', 'resize'] },
  'office-compressor': { formats: ['DOCX', 'XLSX', 'PPTX', 'ODT', 'ODS', 'ODP', 'RTF'], levels: true, toggles: ['batch', 'downscale', 'stripMeta'] },
  'archive-tool': { formats: ['ZIP', '7Z', 'TAR', 'GZ', 'RAR', 'BZ2'], outputs: ['ZIP', '7Z', 'TAR.GZ'], levels: true, toggles: ['password', 'keepFolders', 'batch'] },
  'media-compressor': { formats: ['MP4', 'MOV', 'MKV', 'WebM', 'AVI', 'MP3', 'WAV', 'AAC', 'OGG', 'FLAC'], levels: true, quality: true, toggles: ['batch', 'stripMeta', 'resize'] },
  'image-viewer': { formats: IMG, toggles: [] },
  'text-reader': { formats: ['TXT', 'MD', 'HTML', 'JSON', 'XML', 'CSV', 'LOG', 'YAML'], toggles: [] },
  'ebook-reader': { formats: ['EPUB', 'MOBI', 'AZW3', 'FB2', 'CBZ', 'CBR'], toggles: [] },
  'pdf-images': { formats: ['PDF', 'PNG', 'JPG', 'WebP', 'TIFF'], outputs: ['PNG', 'JPG', 'WebP', 'PDF'], quality: true, toggles: ['batch', 'mergeOne', 'resize'] },
  'spreadsheet-converter': { formats: ['XLSX', 'XLS', 'CSV', 'TSV', 'ODS', 'JSON', 'HTML'], outputs: ['XLSX', 'CSV', 'ODS', 'JSON', 'PDF', 'HTML'], toggles: ['batch', 'allSheets'] },
  'media-converter': { formats: ['MP4', 'MOV', 'MKV', 'WebM', 'AVI', 'GIF', 'MP3', 'WAV', 'AAC', 'OGG', 'FLAC'], outputs: ['MP4', 'WebM', 'GIF', 'MP3', 'WAV', 'OGG'], quality: true, toggles: ['batch', 'resize', 'stripMeta'] },
}

function GenericPlannedPage({ id }: { id: string }) {
  const { t } = useTranslation()
  const cfg = CONFIG[id]!
  const levels = ['light', 'balanced', 'max']
  const features = t(`planned.generic.${id}`, { returnObjects: true }) as string[]
  const showOptions = cfg.levels || cfg.outputs || cfg.quality || cfg.toggles.length > 0
  return (
    <PlannedTool toolId={id} formats={cfg.formats} features={Array.isArray(features) ? features : []}>
      {showOptions && (
        <OptionCard title={t('planned.options')}>
          {cfg.outputs && (
            <div className="mb-5">
              <p className="mb-2 text-sm text-[var(--color-text-secondary)]">{t('planned.image.format')}</p>
              <div className="flex flex-wrap gap-1.5">
                {cfg.outputs.map((f, i) => (
                  <span key={f} className={cn('cursor-not-allowed rounded-lg border px-3 py-1.5 text-sm', i === 0 ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]')}>{f}</span>
                ))}
              </div>
            </div>
          )}
          {cfg.levels && (
            <div className="mb-5 grid gap-2 sm:grid-cols-3">
              {levels.map((l) => (
                <div key={l} className={cn('cursor-not-allowed rounded-lg border p-3', l === 'balanced' ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'border-[var(--color-border)]')}>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{t(`planned.compress.${l}`)}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t(`planned.compress.${l}Hint`)}</p>
                </div>
              ))}
            </div>
          )}
          {cfg.quality && (
            <div className="mb-5">
              <div className="mb-2 flex justify-between text-sm text-[var(--color-text-secondary)]"><span>{t('planned.image.quality')}</span><span className="tabular-nums text-[var(--color-text-tertiary)]">85%</span></div>
              <div className="relative h-1.5 rounded-full bg-[var(--color-border)]"><div className="h-full w-[85%] rounded-full bg-[var(--color-accent)]/40" /></div>
            </div>
          )}
          <div className="space-y-3">
            {cfg.toggles.map((k, i) => <Toggle key={k} label={t(`planned.opt.${k}`)} on={i === 0} />)}
          </div>
          <DisabledRun label={t('planned.run')} />
        </OptionCard>
      )}
    </PlannedTool>
  )
}

export function makePage(id: string) {
  return function Page() {
    return <GenericPlannedPage id={id} />
  }
}
