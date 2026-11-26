import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as XLSX from 'xlsx'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Columns3,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FolderOpen,
  Italic,
  PaintBucket,
  Palette,
  Plus,
  Printer,
  Rows3,
  Sigma,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  cellCoordToRef,
  colIndexToLetter,
  evaluateCell,
  type CellStyle,
  type SheetData,
} from './formulaEngine'

const ACCEPTED_SPREADSHEET_EXTENSIONS =
  '.xlsx,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'

const TEXT_COLORS = ['#18181b', '#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626', '#ffffff']
const FILL_COLORS = ['transparent', '#eef2ff', '#ecfdf5', '#fef3c7', '#fee2e2', '#f4f4f5', '#0f172a']

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function createEmptySheet(name: string, rows = 30, cols = 12): SheetData {
  return { id: uid(), name, rows, cols, cells: {}, styles: {} }
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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) onFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
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
          <FileSpreadsheet className="size-6" aria-hidden />
        </div>

        <div className="text-center">
          <p className="text-base font-medium text-[var(--color-text-primary)]">
            {t('tools.spreadsheetEditor.dropzone')}
          </p>
          <p className="mt-1.5 text-sm text-[var(--color-text-tertiary)]">
            {t('tools.pdfEditor.dropzoneOr')}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-[var(--color-accent-hover)]">
            <Upload className="size-4" />
            {t('tools.pdfEditor.browse')}
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-disabled)]">XLSX · XLS · CSV · ODS</p>
      </div>

      <Button variant="secondary" size="sm" onClick={onNewBlank} className="gap-2">
        <FilePlus2 className="size-4" />
        {t('tools.spreadsheetEditor.newBlank')}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_SPREADSHEET_EXTENSIONS}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
        tabIndex={-1}
      />
    </div>
  )
}

export default function SpreadsheetEditorPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const [workbookName, setWorkbookName] = useState('')
  const [sheets, setSheets] = useState<SheetData[]>(() => [createEmptySheet('Feuille 1')])
  const [activeSheetIdx, setActiveSheetIdx] = useState(0)
  const [selected, setSelected] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openFileInputRef = useRef<HTMLInputElement>(null)
  const cellInputRef = useRef<HTMLInputElement>(null)

  const activeSheet = sheets[activeSheetIdx] ?? sheets[0]!
  const selectedKey = `${selected.r},${selected.c}`
  const selectedRaw = activeSheet.cells[selectedKey] ?? ''
  const selectedStyle = activeSheet.styles[selectedKey] ?? {}

  const createBlankWorkbook = useCallback(() => {
    setError(null)
    setWorkbookName(t('tools.spreadsheetEditor.untitled'))
    setSheets([createEmptySheet(`${t('tools.spreadsheetEditor.sheet')} 1`)])
    setActiveSheetIdx(0)
    setSelected({ r: 0, c: 0 })
    setEditing(null)
    setIsOpen(true)
  }, [t])

  const loadFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        const loadedSheets: SheetData[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name]
          const aoa = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as unknown[][]) : []
          const rows = Math.max(30, aoa.length + 5)
          const maxCols = aoa.reduce((m, row) => Math.max(m, Array.isArray(row) ? row.length : 0), 0)
          const cols = Math.max(12, maxCols + 2)
          const cells: Record<string, string> = {}
          aoa.forEach((row, r) => {
            if (!Array.isArray(row)) return
            row.forEach((val, c) => {
              if (val !== undefined && val !== null && String(val) !== '') {
                cells[`${r},${c}`] = String(val)
              }
            })
          })
          return { id: uid(), name, rows, cols, cells, styles: {} }
        })
        if (loadedSheets.length === 0) {
          loadedSheets.push(createEmptySheet(`${t('tools.spreadsheetEditor.sheet')} 1`))
        }
        const dot = file.name.lastIndexOf('.')
        setWorkbookName(dot > 0 ? file.name.slice(0, dot) : file.name)
        setSheets(loadedSheets)
        setActiveSheetIdx(0)
        setSelected({ r: 0, c: 0 })
        setEditing(null)
        setIsOpen(true)
      } catch (err) {
        console.error('Failed to open spreadsheet:', err)
        setError(t('tools.spreadsheetEditor.loadError'))
      }
    },
    [t],
  )

  useEffect(() => {
    const state = location.state as { file?: File; newBlank?: boolean } | null
    if (state?.file) {
      const f = state.file
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => {
        void loadFile(f)
      })
    } else if (state?.newBlank) {
      navigate(location.pathname, { replace: true, state: null })
      queueMicrotask(() => {
        createBlankWorkbook()
      })
    }
  }, [location.state, location.pathname, navigate, loadFile, createBlankWorkbook])

  const updateActiveSheet = useCallback(
    (updater: (sheet: SheetData) => SheetData) => {
      setSheets((prev) => prev.map((s, idx) => (idx === activeSheetIdx ? updater(s) : s)))
    },
    [activeSheetIdx],
  )

  const setCellValue = useCallback(
    (r: number, c: number, value: string) => {
      const key = `${r},${c}`
      updateActiveSheet((sheet) => {
        const nextCells = { ...sheet.cells }
        if (value === '') delete nextCells[key]
        else nextCells[key] = value
        return { ...sheet, cells: nextCells }
      })
    },
    [updateActiveSheet],
  )

  const updateSelectedStyle = useCallback(
    (patch: Partial<CellStyle>) => {
      updateActiveSheet((sheet) => ({
        ...sheet,
        styles: {
          ...sheet.styles,
          [selectedKey]: { ...(sheet.styles[selectedKey] ?? {}), ...patch },
        },
      }))
    },
    [selectedKey, updateActiveSheet],
  )

  const startEditing = useCallback(
    (r: number, c: number, initial?: string) => {
      const val = initial ?? activeSheet.cells[`${r},${c}`] ?? ''
      setSelected({ r, c })
      setEditing({ r, c })
      setDraftValue(val)
      requestAnimationFrame(() => cellInputRef.current?.focus())
    },
    [activeSheet.cells],
  )

  const commitEdit = useCallback(
    (moveDown = false) => {
      if (!editing) return
      setCellValue(editing.r, editing.c, draftValue)
      const nextR = moveDown ? Math.min(activeSheet.rows - 1, editing.r + 1) : editing.r
      const nextC = editing.c
      setEditing(null)
      setSelected({ r: nextR, c: nextC })
    },
    [activeSheet.rows, draftValue, editing, setCellValue],
  )

  const handleExport = useCallback(
    (format: 'xlsx' | 'csv') => {
      const base = (workbookName || t('tools.spreadsheetEditor.untitled')).trim()
      const wb = XLSX.utils.book_new()
      for (const sheet of sheets) {
        const aoa: (string | number)[][] = []
        for (let r = 0; r < sheet.rows; r++) {
          const row: (string | number)[] = []
          let hasData = false
          for (let c = 0; c < sheet.cols; c++) {
            const evaluated = evaluateCell(r, c, sheet.cells)
            if (evaluated !== '') hasData = true
            const n = Number(evaluated)
            row.push(evaluated !== '' && !Number.isNaN(n) ? n : evaluated)
          }
          if (hasData || r < 5) aoa.push(row)
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
      }
      if (format === 'xlsx') {
        XLSX.writeFile(wb, `${base}.xlsx`)
      } else {
        XLSX.writeFile(wb, `${base}.csv`, { bookType: 'csv' })
      }
      setNotice(t('tools.spreadsheetEditor.exportSuccess'))
      setTimeout(() => setNotice(null), 2500)
    },
    [sheets, t, workbookName],
  )

  const evaluatedCache = useMemo(() => {
    const cache: Record<string, string> = {}
    for (let r = 0; r < activeSheet.rows; r++) {
      for (let c = 0; c < activeSheet.cols; c++) {
        const key = `${r},${c}`
        if (activeSheet.cells[key]) {
          cache[key] = evaluateCell(r, c, activeSheet.cells)
        }
      }
    }
    return cache
  }, [activeSheet.cells, activeSheet.rows, activeSheet.cols])

  if (!isOpen) {
    return (
      <div className="flex flex-1 flex-col">
        {error && (
          <div className="mx-auto mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <DropZone onFile={(f) => void loadFile(f)} onNewBlank={createBlankWorkbook} />
      </div>
    )
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onKeyDown={(e) => {
        if (editing) return
        if (document.activeElement?.tagName === 'INPUT') return
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelected((s) => ({ ...s, r: Math.min(activeSheet.rows - 1, s.r + 1) }))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelected((s) => ({ ...s, r: Math.max(0, s.r - 1) }))
        } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
          e.preventDefault()
          setSelected((s) => ({ ...s, c: Math.min(activeSheet.cols - 1, s.c + 1) }))
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setSelected((s) => ({ ...s, c: Math.max(0, s.c - 1) }))
        } else if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault()
          startEditing(selected.r, selected.c)
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault()
          setCellValue(selected.r, selected.c, '')
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          startEditing(selected.r, selected.c, e.key)
        }
      }}
      tabIndex={0}
    >
      {/* ── Top bar ── */}
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        <FileSpreadsheet className="size-4 shrink-0 text-emerald-500" aria-hidden />
        <input
          type="text"
          value={workbookName}
          onChange={(e) => setWorkbookName(e.target.value)}
          className="min-w-[140px] max-w-xs rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-[var(--color-text-primary)] hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none"
        />

        <div className="ml-auto flex items-center gap-1.5">
          {notice && (
            <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {notice}
            </span>
          )}

          <Button variant="ghost" size="sm" onClick={() => openFileInputRef.current?.click()}>
            <FolderOpen className="size-4" />
            <span className="hidden md:inline">{t('tools.documentEditor.openAnother')}</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={createBlankWorkbook} title={t('tools.spreadsheetEditor.newBlank')}>
            <FilePlus2 className="size-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={() => window.print()} title={t('tools.documentEditor.printPdf')}>
            <Printer className="size-4" />
          </Button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="primary" size="sm" className="gap-1.5">
                <Download className="size-3.5" />
                {t('tools.documentEditor.export')}
                <ChevronDown className="size-3.5 opacity-80" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-[170px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-lg)]"
              >
                <DropdownMenu.Item
                  onSelect={() => handleExport('xlsx')}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-surface-sunken)]"
                >
                  <span>Excel (.xlsx)</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">XLSX</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => handleExport('csv')}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-surface-sunken)]"
                >
                  <span>CSV (.csv)</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">CSV</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <Button variant="ghost" size="icon-sm" onClick={() => setIsOpen(false)} title={t('tools.pdfEditor.close')}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Formatting toolbar ── */}
      <div className="no-print flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-1.5">
        <button
          type="button"
          onClick={() => updateSelectedStyle({ bold: !selectedStyle.bold })}
          title={t('tools.pdfEditor.props.bold')}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md text-xs',
            selectedStyle.bold
              ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]',
          )}
        >
          <Bold className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => updateSelectedStyle({ italic: !selectedStyle.italic })}
          title={t('tools.pdfEditor.props.italic')}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md text-xs',
            selectedStyle.italic
              ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]',
          )}
        >
          <Italic className="size-3.5" />
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              title={t('tools.pdfEditor.props.color')}
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
                  onSelect={() => updateSelectedStyle({ color: c })}
                  className="size-5 cursor-pointer rounded-full border border-black/15 outline-none hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              title={t('tools.pdfEditor.props.fillColor')}
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]"
            >
              <PaintBucket className="size-3.5" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="z-50 flex gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-lg)]">
              {FILL_COLORS.map((c) => (
                <DropdownMenu.Item
                  key={c}
                  onSelect={() => updateSelectedStyle({ bg: c === 'transparent' ? undefined : c })}
                  className="size-5 cursor-pointer rounded-full border border-black/15 outline-none hover:scale-110"
                  style={{ backgroundColor: c === 'transparent' ? '#ffffff' : c }}
                />
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />

        {(['left', 'center', 'right'] as const).map((al) => {
          const Icon = al === 'left' ? AlignLeft : al === 'center' ? AlignCenter : AlignRight
          return (
            <button
              key={al}
              type="button"
              onClick={() => updateSelectedStyle({ align: al })}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-md',
                selectedStyle.align === al
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]',
              )}
            >
              <Icon className="size-3.5" />
            </button>
          )
        })}

        <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />

        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            startEditing(selected.r, selected.c, `=SOMME(A1:${colIndexToLetter(selected.c)}${Math.max(1, selected.r)})`)
          }
          className="gap-1 text-xs"
          title="=SOMME(...)"
        >
          <Sigma className="size-3.5" />
          SOMME
        </Button>

        <Button
          variant="ghost"
          size="xs"
          onClick={() => updateActiveSheet((s) => ({ ...s, rows: s.rows + 5 }))}
          className="gap-1 text-xs"
        >
          <Rows3 className="size-3.5" />
          +5 {t('tools.spreadsheetEditor.rows')}
        </Button>

        <Button
          variant="ghost"
          size="xs"
          onClick={() => updateActiveSheet((s) => ({ ...s, cols: s.cols + 2 }))}
          className="gap-1 text-xs"
        >
          <Columns3 className="size-3.5" />
          +2 {t('tools.spreadsheetEditor.cols')}
        </Button>
      </div>

      {/* ── Formula bar ── */}
      <div className="no-print flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5">
        <span className="w-12 rounded bg-[var(--color-surface-sunken)] px-2 py-0.5 text-center font-mono text-xs font-semibold text-[var(--color-text-primary)]">
          {cellCoordToRef(selected.r, selected.c)}
        </span>
        <span className="font-mono text-xs italic text-[var(--color-text-tertiary)]">fx</span>
        <input
          type="text"
          value={editing ? draftValue : selectedRaw}
          onChange={(e) => {
            if (editing) setDraftValue(e.target.value)
            else setCellValue(selected.r, selected.c, e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (editing) commitEdit(true)
              else setSelected((s) => ({ ...s, r: Math.min(activeSheet.rows - 1, s.r + 1) }))
            }
          }}
          placeholder={t('tools.spreadsheetEditor.formulaHint')}
          className="flex-1 bg-transparent font-mono text-xs text-[var(--color-text-primary)] focus:outline-none"
        />
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto bg-white dark:bg-zinc-950">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-raised)]">
            <tr>
              <th className="w-10 border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1 text-center font-mono text-[11px] text-[var(--color-text-tertiary)]" />
              {Array.from({ length: activeSheet.cols }, (_, c) => (
                <th
                  key={c}
                  className={cn(
                    'min-w-[96px] border border-[var(--color-border)] px-2 py-1 text-center font-mono text-[11px] font-medium',
                    selected.c === c
                      ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)]',
                  )}
                >
                  {colIndexToLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: activeSheet.rows }, (_, r) => (
              <tr key={r}>
                <td
                  className={cn(
                    'sticky left-0 border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1.5 py-1 text-center font-mono text-[11px]',
                    selected.r === r
                      ? 'bg-[var(--color-accent-light)] font-semibold text-[var(--color-accent)]'
                      : 'text-[var(--color-text-tertiary)]',
                  )}
                >
                  {r + 1}
                </td>
                {Array.from({ length: activeSheet.cols }, (_, c) => {
                  const key = `${r},${c}`
                  const isSel = selected.r === r && selected.c === c
                  const isEd = editing?.r === r && editing?.c === c
                  const st = activeSheet.styles[key]
                  const displayVal = evaluatedCache[key] ?? ''
                  return (
                    <td
                      key={c}
                      onClick={() => {
                        if (editing && (editing.r !== r || editing.c !== c)) {
                          commitEdit(false)
                        }
                        setSelected({ r, c })
                      }}
                      onDoubleClick={() => startEditing(r, c)}
                      style={{
                        backgroundColor: st?.bg,
                        color: st?.color,
                        fontWeight: st?.bold ? 700 : 400,
                        fontStyle: st?.italic ? 'italic' : 'normal',
                        textAlign: st?.align ?? (!Number.isNaN(Number(displayVal)) && displayVal !== '' ? 'right' : 'left'),
                      }}
                      className={cn(
                        'relative h-7 max-w-[180px] border border-zinc-200 px-2 py-0.5 text-zinc-900 dark:border-zinc-800 dark:text-zinc-100',
                        isSel && 'outline-2 -outline-offset-2 outline-[var(--color-accent)]',
                      )}
                    >
                      {isEd ? (
                        <input
                          ref={cellInputRef}
                          type="text"
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onBlur={() => commitEdit(false)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitEdit(true)
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              setEditing(null)
                            }
                          }}
                          className="h-full w-full bg-transparent text-xs focus:outline-none"
                        />
                      ) : (
                        <span className="block truncate">{displayVal}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Sheet tabs bar ── */}
      <div className="no-print flex items-center gap-1 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5">
        {sheets.map((s, idx) => (
          <div
            key={s.id}
            className={cn(
              'group flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              idx === activeSheetIdx
                ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-xs'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]',
            )}
          >
            <button
              type="button"
              onClick={() => {
                setActiveSheetIdx(idx)
                setSelected({ r: 0, c: 0 })
                setEditing(null)
              }}
              onDoubleClick={() => {
                const nextName = window.prompt(t('tools.spreadsheetEditor.renameSheet'), s.name)
                if (nextName && nextName.trim()) {
                  setSheets((prev) => prev.map((sh, i) => (i === idx ? { ...sh, name: nextName.trim() } : sh)))
                }
              }}
            >
              {s.name}
            </button>
            {sheets.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setSheets((prev) => prev.filter((_, i) => i !== idx))
                  setActiveSheetIdx((cur) => Math.max(0, cur >= idx ? cur - 1 : cur))
                }}
                className="opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                aria-label="Delete sheet"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const nextNum = sheets.length + 1
            setSheets((prev) => [...prev, createEmptySheet(`${t('tools.spreadsheetEditor.sheet')} ${nextNum}`)])
            setActiveSheetIdx(sheets.length)
          }}
          className="inline-flex size-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]"
          title={t('tools.spreadsheetEditor.addSheet')}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <input
        ref={openFileInputRef}
        type="file"
        accept={ACCEPTED_SPREADSHEET_EXTENSIONS}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void loadFile(f)
        }}
      />
    </div>
  )
}
