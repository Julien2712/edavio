import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from '@/workspace/tabRouter'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Download,
  Eraser,
  FilePlus2,
  FileType2,
  FolderOpen,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Palette,
  Printer,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useTabBridge } from '@/workspace/useTabBridge'
import { isProjectFile, type ProjectFile } from '@/workspace/project'
import {
  ACCEPTED_DOCUMENT_EXTENSIONS,
  exportDocumentAsDocx,
  exportDocumentAsHtml,
  exportDocumentAsMarkdown,
  exportDocumentAsTxt,
  importDocumentFile,
  stripExtension,
  type DocFormat,
} from './docFormats'

const TEXT_COLORS = ['#18181b', '#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626', '#71717a']
const HIGHLIGHT_COLORS = ['transparent', '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa']

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-[var(--color-border)]" aria-hidden />
}

function ToolbarBtn({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => {
        // Keep editor selection intact when clicking toolbar buttons
        e.preventDefault()
      }}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors',
        active
          ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
          : 'hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]',
      )}
    >
      {children}
    </button>
  )
}

function DropZone({
  onFile,
  onNewBlank,
}: {
  onFile: (file: File) => void
  onNewBlank: () => void
}) {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFile(file)
      e.target.value = ''
    },
    [onFile],
  )

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        aria-label={t('tools.documentEditor.dropzone')}
        className={cn(
          'group relative flex w-full max-w-md cursor-pointer select-none flex-col items-center gap-5 rounded-2xl border border-dashed p-12 transition-colors',
          dragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]',
        )}
      >
        <div
          className={cn(
            'flex size-14 items-center justify-center rounded-xl transition-colors',
            dragging
              ? 'bg-[var(--color-accent)] text-white'
              : 'bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)] group-hover:bg-[var(--color-accent)] group-hover:text-white',
          )}
        >
          <FileType2 className="size-6" aria-hidden />
        </div>

        <div className="text-center">
          <p className="text-base font-medium text-[var(--color-text-primary)]">
            {t('tools.documentEditor.dropzone')}
          </p>
          <p className="mt-1.5 text-sm text-[var(--color-text-tertiary)]">
            {t('tools.pdfEditor.dropzoneOr')}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-[var(--color-accent-hover)]">
            <Upload className="size-4" />
            {t('tools.pdfEditor.browse')}
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-disabled)]">DOCX · TXT · MD · HTML · RTF</p>
      </div>

      <Button variant="secondary" size="sm" onClick={onNewBlank} className="gap-2">
        <FilePlus2 className="size-4" />
        {t('tools.documentEditor.newBlank')}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        className="sr-only"
        onChange={handleChange}
        tabIndex={-1}
      />
    </div>
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function DocumentEditorPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const [docTitle, setDocTitle] = useState('')
  const [sourceFormat, setSourceFormat] = useState<DocFormat>('docx')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [stats, setStats] = useState({ words: 0, chars: 0 })
  const [blockTag, setBlockTag] = useState('p')
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
  })

  const editorRef = useRef<HTMLDivElement>(null)
  const openFileInputRef = useRef<HTMLInputElement>(null)
  const insertImageInputRef = useRef<HTMLInputElement>(null)
  const pendingHtmlRef = useRef<string | null>(null)

  const { saveProject, openProjectFile } = useTabBridge({
    hasContent: isOpen,
    title: docTitle,
    getProject: (): ProjectFile => ({
      app: 'edavio', version: 1, kind: 'document', title: docTitle, savedAt: new Date().toISOString(),
      data: { title: docTitle, format: sourceFormat, html: editorRef.current?.innerHTML ?? '' },
    }),
  })

  const updateStatsAndFormats = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const text = (el.innerText || '').trim()
    const words = text ? text.split(/\s+/).length : 0
    const chars = text.length
    setStats({ words, chars })

    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
      })
      const blk = (document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '')
      if (blk) setBlockTag(blk)
    } catch {
      // Selection may be outside editor
    }
  }, [])

  // Apply pending HTML once the contentEditable node mounts
  useEffect(() => {
    if (isOpen && editorRef.current && pendingHtmlRef.current !== null) {
      editorRef.current.innerHTML = pendingHtmlRef.current
      pendingHtmlRef.current = null
      updateStatsAndFormats()
    }
  }, [isOpen, updateStatsAndFormats])

  const loadFile = useCallback(
    async (file: File) => {
      if (isProjectFile(file)) {
        try { await openProjectFile(file) } catch { setError(t('workspace.projectError')) }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const imported = await importDocumentFile(file)
        pendingHtmlRef.current = imported.html
        setDocTitle(stripExtension(imported.name))
        setSourceFormat(imported.format)
        setIsOpen(true)
        if (editorRef.current) {
          editorRef.current.innerHTML = imported.html
          pendingHtmlRef.current = null
          updateStatsAndFormats()
        }
      } catch (err) {
        console.error('Failed to open document:', err)
        setError(t('tools.documentEditor.loadError'))
      } finally {
        setLoading(false)
      }
    },
    [t, updateStatsAndFormats, openProjectFile],
  )

  const createBlankDocument = useCallback(() => {
    setError(null)
    pendingHtmlRef.current = '<p><br /></p>'
    setDocTitle(t('tools.documentEditor.untitled'))
    setSourceFormat('docx')
    setIsOpen(true)
    if (editorRef.current) {
      editorRef.current.innerHTML = '<p><br /></p>'
      pendingHtmlRef.current = null
      updateStatsAndFormats()
      editorRef.current.focus()
    }
  }, [t, updateStatsAndFormats])

  // Load file or blank document passed from EditPage via router state
  useEffect(() => {
    const state = location.state as { file?: File; newBlank?: boolean; project?: ProjectFile } | null
    if (state?.project) {
      const d = state.project.data as { title: string; format: DocFormat; html: string }
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => {
        pendingHtmlRef.current = d.html
        setDocTitle(d.title)
        setSourceFormat(d.format)
        setIsOpen(true)
        if (editorRef.current) {
          editorRef.current.innerHTML = d.html
          pendingHtmlRef.current = null
          updateStatsAndFormats()
        }
      })
    } else if (state?.file) {
      const f = state.file
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => {
        void loadFile(f)
      })
    } else if (state?.newBlank) {
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => {
        createBlankDocument()
      })
    }
  }, [location.state, location.pathname, navigate, loadFile, createBlankDocument])

  const exec = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus()
      document.execCommand(command, false, value)
      updateStatsAndFormats()
    },
    [updateStatsAndFormats],
  )

  const handleInsertImage = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          exec('insertImage', reader.result)
        }
      }
      reader.readAsDataURL(file)
    },
    [exec],
  )

  const handleInsertTable = useCallback(() => {
    const tableHtml =
      '<table><thead><tr><th>Colonne 1</th><th>Colonne 2</th><th>Colonne 3</th></tr></thead><tbody><tr><td>Cellule</td><td>Cellule</td><td>Cellule</td></tr><tr><td>Cellule</td><td>Cellule</td><td>Cellule</td></tr></tbody></table><p><br /></p>'
    exec('insertHTML', tableHtml)
  }, [exec])

  const handleInsertLink = useCallback(() => {
    const url = window.prompt('URL (https://...) :')
    if (url && url.trim()) {
      exec('createLink', url.trim())
    }
  }, [exec])

  const handleExport = useCallback(
    async (target: 'docx' | 'html' | 'md' | 'txt') => {
      const html = editorRef.current?.innerHTML ?? ''
      const baseName = (docTitle || t('tools.documentEditor.untitled')).trim()
      setExporting(true)
      try {
        if (target === 'docx') {
          const blob = await exportDocumentAsDocx(html, baseName)
          downloadBlob(blob, `${baseName}.docx`)
        } else if (target === 'html') {
          downloadBlob(exportDocumentAsHtml(html, baseName), `${baseName}.html`)
        } else if (target === 'md') {
          downloadBlob(exportDocumentAsMarkdown(html), `${baseName}.md`)
        } else {
          downloadBlob(exportDocumentAsTxt(html), `${baseName}.txt`)
        }
        setNotice(t('tools.documentEditor.exportSuccess'))
        setTimeout(() => setNotice(null), 2500)
      } catch (err) {
        console.error('Export failed:', err)
        setError(t('tools.documentEditor.exportError'))
      } finally {
        setExporting(false)
      }
    },
    [docTitle, t],
  )

  if (!isOpen) {
    return (
      <div className="flex flex-1 flex-col">
        {loading && (
          <div className="mx-auto mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text-secondary)]">
            {t('tools.documentEditor.loading')}
          </div>
        )}
        {error && (
          <div className="mx-auto mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </div>
        )}
        <DropZone onFile={(f) => void loadFile(f)} onNewBlank={createBlankDocument} />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        <FileType2 className="size-4 shrink-0 text-sky-500" aria-hidden />
        <input
          type="text"
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          aria-label={t('tools.documentEditor.docTitle')}
          className="min-w-[140px] max-w-xs rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-[var(--color-text-primary)] hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <span className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">
          {sourceFormat}
        </span>

        <span className="hidden text-xs text-[var(--color-text-tertiary)] sm:inline">
          · {stats.words} {t('tools.documentEditor.words')} · {stats.chars} {t('tools.documentEditor.chars')}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          {notice && (
            <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {notice}
            </span>
          )}
          {error && (
            <span className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => openFileInputRef.current?.click()}
            title={t('tools.documentEditor.openAnother')}
          >
            <FolderOpen className="size-4" />
            <span className="hidden md:inline">{t('tools.documentEditor.openAnother')}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={createBlankDocument}
            title={t('tools.documentEditor.newBlank')}
          >
            <FilePlus2 className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            title={t('tools.documentEditor.printPdf')}
          >
            <Printer className="size-4" />
          </Button>

          <Button variant="secondary" size="sm" title={t('workspace.saveProjectHint')} onClick={() => void saveProject()}>
            {t('workspace.saveProject')}
          </Button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="primary" size="sm" disabled={exporting} className="gap-1.5">
                <Download className="size-3.5" />
                {exporting ? t('tools.pdfEditor.exporting') : t('tools.documentEditor.export')}
                <ChevronDown className="size-3.5 opacity-80" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-[180px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-lg)]"
              >
                <DropdownMenu.Item
                  onSelect={() => void handleExport('docx')}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-surface-sunken)]"
                >
                  <span>Word (.docx)</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">DOCX</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => void handleExport('md')}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-surface-sunken)]"
                >
                  <span>Markdown (.md)</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">MD</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => void handleExport('html')}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-surface-sunken)]"
                >
                  <span>Page web (.html)</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">HTML</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => void handleExport('txt')}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-surface-sunken)]"
                >
                  <span>Texte brut (.txt)</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">TXT</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsOpen(false)}
            title={t('tools.pdfEditor.close')}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Formatting toolbar ── */}
      <div className="no-print flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-1.5">
        <ToolbarBtn title={t('tools.pdfEditor.undo')} onClick={() => exec('undo')}>
          <Undo2 className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.pdfEditor.redo')} onClick={() => exec('redo')}>
          <Redo2 className="size-3.5" />
        </ToolbarBtn>

        <ToolbarDivider />

        <select
          value={blockTag}
          onChange={(e) => {
            setBlockTag(e.target.value)
            exec('formatBlock', e.target.value)
          }}
          aria-label={t('tools.documentEditor.style')}
          className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)] focus:outline-none"
        >
          <option value="p">{t('tools.documentEditor.normal')}</option>
          <option value="h1">{t('tools.documentEditor.heading1')}</option>
          <option value="h2">{t('tools.documentEditor.heading2')}</option>
          <option value="h3">{t('tools.documentEditor.heading3')}</option>
          <option value="blockquote">{t('tools.documentEditor.quote')}</option>
          <option value="pre">{t('tools.documentEditor.code')}</option>
        </select>

        <select
          defaultValue="Inter, system-ui, sans-serif"
          onChange={(e) => exec('fontName', e.target.value)}
          aria-label={t('tools.pdfEditor.props.fontFamily')}
          className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)] focus:outline-none"
        >
          <option value="Inter, system-ui, sans-serif">Sans-serif</option>
          <option value="Georgia, serif">Serif (Georgia)</option>
          <option value="'Times New Roman', serif">Times New Roman</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="'JetBrains Mono', monospace">Monospace</option>
        </select>

        <select
          defaultValue="3"
          onChange={(e) => exec('fontSize', e.target.value)}
          aria-label={t('tools.pdfEditor.props.fontSize')}
          className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)] focus:outline-none"
        >
          <option value="2">12 px</option>
          <option value="3">16 px</option>
          <option value="4">18 px</option>
          <option value="5">24 px</option>
          <option value="6">32 px</option>
        </select>

        <ToolbarDivider />

        <ToolbarBtn title={t('tools.pdfEditor.props.bold')} active={activeFormats.bold} onClick={() => exec('bold')}>
          <Bold className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.pdfEditor.props.italic')} active={activeFormats.italic} onClick={() => exec('italic')}>
          <Italic className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.underline')} active={activeFormats.underline} onClick={() => exec('underline')}>
          <Underline className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.strike')} active={activeFormats.strike} onClick={() => exec('strikeThrough')}>
          <Strikethrough className="size-3.5" />
        </ToolbarBtn>

        <ToolbarDivider />

        {/* Text color dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              title={t('tools.pdfEditor.props.color')}
              onMouseDown={(e) => e.preventDefault()}
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]"
            >
              <Palette className="size-3.5" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="z-50 flex gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-lg)]">
              {TEXT_COLORS.map((c) => (
                <DropdownMenu.Item
                  key={c}
                  onSelect={() => exec('foreColor', c)}
                  className="size-5 cursor-pointer rounded-full border border-black/15 outline-none transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Highlight color dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              title={t('tools.pdfEditor.tools.highlight')}
              onMouseDown={(e) => e.preventDefault()}
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]"
            >
              <Highlighter className="size-3.5" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="z-50 flex gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-lg)]">
              {HIGHLIGHT_COLORS.map((c) => (
                <DropdownMenu.Item
                  key={c}
                  onSelect={() => exec('hiliteColor', c)}
                  className="size-5 cursor-pointer rounded-full border border-black/15 outline-none transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c === 'transparent' ? '#ffffff' : c,
                  }}
                />
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <ToolbarDivider />

        <ToolbarBtn title={t('tools.documentEditor.alignLeft')} onClick={() => exec('justifyLeft')}>
          <AlignLeft className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.alignCenter')} onClick={() => exec('justifyCenter')}>
          <AlignCenter className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.alignRight')} onClick={() => exec('justifyRight')}>
          <AlignRight className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.alignJustify')} onClick={() => exec('justifyFull')}>
          <AlignJustify className="size-3.5" />
        </ToolbarBtn>

        <ToolbarDivider />

        <ToolbarBtn title={t('tools.documentEditor.bulletList')} onClick={() => exec('insertUnorderedList')}>
          <List className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.numberedList')} onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="size-3.5" />
        </ToolbarBtn>

        <ToolbarDivider />

        <ToolbarBtn title={t('tools.pdfEditor.tools.image')} onClick={() => insertImageInputRef.current?.click()}>
          <ImagePlus className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.insertTable')} onClick={handleInsertTable}>
          <TableIcon className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.insertLink')} onClick={handleInsertLink}>
          <Link2 className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.insertDivider')} onClick={() => exec('insertHorizontalRule')}>
          <Minus className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t('tools.documentEditor.clearFormat')} onClick={() => exec('removeFormat')}>
          <Eraser className="size-3.5" />
        </ToolbarBtn>
      </div>

      {/* ── Page canvas ── */}
      <div className="flex-1 overflow-y-auto bg-[var(--color-surface-sunken)] px-4 py-8 sm:px-8 print:bg-white print:p-0">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={updateStatsAndFormats}
          onKeyUp={updateStatsAndFormats}
          onMouseUp={updateStatsAndFormats}
          className="doc-editor-content mx-auto min-h-[1050px] w-full max-w-[794px] rounded-sm bg-white px-12 py-14 text-[15px] leading-relaxed text-zinc-900 shadow-[var(--shadow-xl)] focus:outline-none sm:px-16 print:min-h-0 print:max-w-none print:p-0 print:shadow-none"
        />
      </div>

      <input
        ref={openFileInputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void loadFile(f)
        }}
      />
      <input
        ref={insertImageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={handleInsertImage}
      />
    </div>
  )
}
