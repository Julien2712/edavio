import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { Calc, FErr, canonicalizeFormula, rewriteRefs, type V } from './formula'
import { DEFAULT_COL_W, DEFAULT_ROW_H, colName, key, newSheet, type Border, type BorderStyle, type Cell, type CellStyle, type CondRule, type Range, type Sheet, type Workbook } from './model'
import { dateToSerial } from './format'

const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72']

function tint(hex: string, t: number): string {
  const n = parseInt(hex, 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t))
  return ch.map((c) => c.toString(16).padStart(2, '0')).join('')
}

function colorOf(c: (Partial<ExcelJS.Color> & { tint?: number }) | undefined): string | undefined {
  if (!c) return undefined
  if (c.argb) return '#' + c.argb.slice(-6).toLowerCase()
  if (c.theme !== undefined) {
    const base = THEME[c.theme] ?? '000000'
    return '#' + (c.tint ? tint(base, c.tint) : base).toLowerCase()
  }
  return undefined
}

const BORDER_STYLES: Record<string, BorderStyle> = { thin: 'thin', hair: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', mediumDashed: 'dashed', dotted: 'dotted', double: 'double' }

function borderOf(b: Partial<ExcelJS.Border> | undefined): Border | undefined {
  if (!b?.style) return undefined
  return { style: BORDER_STYLES[b.style] ?? 'thin', color: colorOf(b.color) ?? '#000000' }
}

const parseAddr = (a: string) => {
  const m = a.match(/^([A-Z]+)(\d+)$/)!
  let c = 0
  for (const ch of m[1]!) c = c * 26 + ch.charCodeAt(0) - 64
  return { r: parseInt(m[2]!, 10) - 1, c: c - 1 }
}

function rangeOfAddr(a: string): Range {
  const [x, y = x] = a.split(':')
  const p = parseAddr(x!), q = parseAddr(y!)
  return { r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) }
}

function cellText(v: ExcelJS.CellValue): { raw: string; date?: boolean } {
  if (v === null || v === undefined) return { raw: '' }
  if (typeof v === 'number') return { raw: String(v) }
  if (typeof v === 'boolean') return { raw: v ? 'TRUE' : 'FALSE' }
  if (typeof v === 'string') return { raw: /^[=']|^[-+]?\d+(\.\d+)?$/.test(v) || v.toUpperCase() === 'TRUE' || v.toUpperCase() === 'FALSE' ? "'" + v : v }
  if (v instanceof Date) return { raw: String(dateToSerial(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds()))), date: true }
  const o = v as unknown as Record<string, unknown>
  if ('formula' in o && typeof o.formula === 'string') return { raw: '=' + o.formula }
  if ('sharedFormula' in o) return { raw: o.result !== undefined && o.result !== null ? cellText(o.result as ExcelJS.CellValue).raw : '' }
  if ('richText' in o) return { raw: (o.richText as { text: string }[]).map((t) => t.text).join('') }
  if ('text' in o && typeof o.text === 'string') return { raw: o.text }
  if ('error' in o) return { raw: String(o.error) }
  return { raw: '' }
}

export async function importXlsx(buffer: ArrayBuffer, title: string): Promise<Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const sheets: Sheet[] = []
  wb.eachSheet((ws) => {
    const sh = newSheet(ws.name, Math.max(100, ws.rowCount + 20), Math.max(26, ws.columnCount + 5))
    sh.showGrid = ws.views?.[0]?.showGridLines !== false
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (row.height) sh.rowH[rn - 1] = Math.round((row.height * 96) / 72)
      if (row.hidden) sh.hiddenRows.push(rn - 1)
      row.eachCell({ includeEmpty: true }, (cell, cn) => {
        if (cell.isMerged && cell.master !== cell) return
        const { raw, date } = cellText(cell.value)
        const style: CellStyle = {}
        const f = cell.font
        if (f) {
          if (f.bold) style.bold = true
          if (f.italic) style.italic = true
          if (f.underline) style.underline = true
          if (f.strike) style.strike = true
          if (f.name && f.name !== 'Calibri') style.font = f.name
          if (f.size && f.size !== 11) style.size = f.size
          const col = colorOf(f.color)
          if (col && col !== '#000000') style.color = col
        }
        const fill = cell.fill
        if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
          const bg = colorOf(fill.fgColor)
          if (bg && bg !== '#ffffff') style.bg = bg
        }
        const al = cell.alignment
        if (al) {
          if (al.horizontal === 'left' || al.horizontal === 'center' || al.horizontal === 'right') style.h = al.horizontal
          if (al.vertical === 'top' || al.vertical === 'middle' || al.vertical === 'bottom') style.v = al.vertical
          if (al.wrapText) style.wrap = true
          if (al.indent) style.indent = al.indent
        }
        const bd = cell.border
        if (bd) {
          style.bt = borderOf(bd.top); style.br = borderOf(bd.right); style.bb = borderOf(bd.bottom); style.bl = borderOf(bd.left)
        }
        if (cell.numFmt && cell.numFmt !== 'General') style.fmt = cell.numFmt
        else if (date) style.fmt = 'dd/mm/yyyy'
        for (const k of Object.keys(style) as (keyof CellStyle)[]) if (style[k] === undefined) delete style[k]
        if (raw === '' && !Object.keys(style).length) return
        const c: Cell = { v: raw }
        if (Object.keys(style).length) c.s = style
        sh.cells[key(rn - 1, cn - 1)] = c
        const dv = cell.dataValidation as { type?: string; formulae?: string[]; operator?: string } | undefined
        if (dv?.type === 'list' && dv.formulae?.[0]?.startsWith('"')) {
          sh.validations = [...(sh.validations ?? []), { range: { r1: rn - 1, c1: cn - 1, r2: rn - 1, c2: cn - 1 }, type: 'list', items: dv.formulae[0].replace(/^"|"$/g, '').split(',') }]
        }
      })
    })
    ws.columns?.forEach((col, i) => {
      if (col?.width) sh.colW[i] = Math.round(col.width * 7 + 5)
      if (col?.hidden) sh.hiddenCols.push(i)
    })
    for (const m of ws.model.merges ?? []) sh.merges.push(rangeOfAddr(m))
    const v = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number } | undefined
    if (v?.state === 'frozen') { sh.freezeC = v.xSplit ?? 0; sh.freezeR = v.ySplit ?? 0 }
    // conditional formatting (simple rules)
    const cfs = (ws as unknown as { conditionalFormattings?: { ref: string; rules: { type: string; operator?: string; formulae?: string[]; text?: string; style?: { fill?: { bgColor?: ExcelJS.Color; fgColor?: ExcelJS.Color }; font?: { color?: ExcelJS.Color; bold?: boolean } } }[] }[] }).conditionalFormattings ?? []
    for (const cf of cfs) for (const rule of cf.rules) {
      const range = rangeOfAddr(cf.ref.split(' ')[0]!)
      const bg = colorOf(rule.style?.fill?.bgColor ?? rule.style?.fill?.fgColor)
      const color = colorOf(rule.style?.font?.color)
      const base = { id: Math.random().toString(36).slice(2, 8), range, bg, color, bold: rule.style?.font?.bold }
      const a = rule.formulae?.[0]
      const typeMap: Record<string, CondRule['type']> = { greaterThan: 'gt', lessThan: 'lt', equal: 'eq', notEqual: 'neq', between: 'between' }
      if (rule.type === 'cellIs' && rule.operator && typeMap[rule.operator]) sh.rules.push({ ...base, type: typeMap[rule.operator]!, a: a, b: rule.formulae?.[1] })
      else if (rule.type === 'containsText') sh.rules.push({ ...base, type: 'contains', a: rule.text })
    }
    sheets.push(sh)
  })
  return { title, sheets: sheets.length ? sheets : [newSheet('Feuil1')] }
}

export function importOther(buffer: ArrayBuffer, title: string): Workbook {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheets: Sheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]!
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][]
    const sh = newSheet(name.slice(0, 31), Math.max(100, aoa.length + 20), Math.max(26, Math.max(0, ...aoa.map((r) => r.length)) + 5))
    aoa.forEach((row, r) => row.forEach((v, c) => {
      if (v === '' || v === null || v === undefined) return
      let raw: string, fmt: string | undefined
      if (v instanceof Date) { raw = String(dateToSerial(new Date(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes()))); fmt = 'dd/mm/yyyy' }
      else if (typeof v === 'number') raw = String(v)
      else if (typeof v === 'boolean') raw = v ? 'TRUE' : 'FALSE'
      else { const s = String(v); raw = /^[=']/.test(s) || /^[-+]?\d+(\.\d+)?$/.test(s) ? "'" + s : s }
      sh.cells[key(r, c)] = fmt ? { v: raw, s: { fmt } } : { v: raw }
    }))
    return sh
  })
  return { title, sheets: sheets.length ? sheets : [newSheet('Feuil1')] }
}

export async function importSpreadsheet(file: File): Promise<Workbook> {
  const buffer = await file.arrayBuffer()
  const title = file.name.replace(/\.[^.]+$/, '')
  if (/\.xlsx$|\.xlsm$/i.test(file.name)) return importXlsx(buffer, title)
  return importOther(buffer, title)
}

// ── Export ───────────────────────────────────────────────────────────────────

const argb = (c: string | undefined) => (c ? 'FF' + c.replace('#', '').toUpperCase() : undefined)

function toExcelFormula(f: string): string {
  return canonicalizeFormula(f).slice(1)
}

export async function exportXlsx(wb: Workbook): Promise<Blob> {
  const calc = new Calc(wb)
  const out = new ExcelJS.Workbook()
  out.creator = 'Edavio'
  wb.sheets.forEach((sh, si) => {
    const ws = out.addWorksheet(sh.name.slice(0, 31), { views: [{ showGridLines: sh.showGrid, state: sh.freezeR || sh.freezeC ? 'frozen' : 'normal', xSplit: sh.freezeC, ySplit: sh.freezeR } as ExcelJS.WorksheetView] })
    for (const [k, v] of Object.entries(sh.colW)) ws.getColumn(Number(k) + 1).width = Math.max(1, (v - 5) / 7)
    sh.hiddenCols.forEach((c) => (ws.getColumn(c + 1).hidden = true))
    for (const [k, v] of Object.entries(sh.rowH)) ws.getRow(Number(k) + 1).height = (v * 72) / 96
    sh.hiddenRows.forEach((r) => (ws.getRow(r + 1).hidden = true))
    for (const v of sh.validations ?? []) {
      for (let r = v.range.r1; r <= v.range.r2; r++) for (let c = v.range.c1; c <= v.range.c2; c++) {
        ws.getCell(r + 1, c + 1).dataValidation = v.type === 'list'
          ? { type: 'list', allowBlank: true, formulae: [`"${(v.items ?? []).join(',')}"`] }
          : { type: v.type, operator: 'between', allowBlank: true, formulae: [v.min ?? -1e15, v.max ?? 1e15] } as ExcelJS.DataValidation
      }
    }
    for (const [k, cell] of Object.entries(sh.cells)) {
      const [r, c] = k.split(',').map(Number) as [number, number]
      const x = ws.getCell(r + 1, c + 1)
      const raw = cell.v
      if (raw !== '') {
        if (raw[0] === '=') {
          const res = calc.value(si, r, c)
          x.value = { formula: toExcelFormula(raw), result: res instanceof FErr ? ({ error: res.code } as unknown as ExcelJS.CellErrorValue) : (res as number | string | boolean | undefined) ?? undefined } as ExcelJS.CellFormulaValue
        } else if (raw[0] === "'") x.value = raw.slice(1)
        else if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(raw)) x.value = parseFloat(raw)
        else if (raw.toUpperCase() === 'TRUE' || raw.toUpperCase() === 'FALSE') x.value = raw.toUpperCase() === 'TRUE'
        else x.value = raw
      }
      const s = cell.s
      if (!s) continue
      x.font = { name: s.font ?? 'Calibri', size: s.size ?? 11, bold: s.bold, italic: s.italic, underline: s.underline, strike: s.strike, color: s.color ? { argb: argb(s.color)! } : undefined }
      if (s.bg) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(s.bg)! } }
      x.alignment = { horizontal: s.h && s.h !== 'general' ? s.h : undefined, vertical: s.v, wrapText: s.wrap, indent: s.indent }
      const bd = (b: Border | undefined) => (b ? { style: b.style as ExcelJS.BorderStyle, color: { argb: argb(b.color)! } } : undefined)
      if (s.bt || s.br || s.bb || s.bl) x.border = { top: bd(s.bt), right: bd(s.br), bottom: bd(s.bb), left: bd(s.bl) }
      if (s.fmt && s.fmt !== 'General') x.numFmt = s.fmt
    }
    for (const m of sh.merges) ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1)
    const ref = (r: Range) => `${colName(r.c1)}${r.r1 + 1}:${colName(r.c2)}${r.r2 + 1}`
    for (const rule of sh.rules) {
      const style = { fill: rule.bg ? ({ type: 'pattern', pattern: 'solid', bgColor: { argb: argb(rule.bg)! }, fgColor: { argb: argb(rule.bg)! } } as ExcelJS.FillPattern) : undefined, font: { color: rule.color ? { argb: argb(rule.color)! } : undefined, bold: rule.bold } }
      const ops: Partial<Record<CondRule['type'], ExcelJS.CellIsRuleType['operator'] | string>> = { gt: 'greaterThan', lt: 'lessThan', eq: 'equal', neq: 'notEqual' as ExcelJS.CellIsRuleType['operator'], between: 'between' }
      const op = ops[rule.type]
      if (op) ws.addConditionalFormatting({ ref: ref(rule.range), rules: [{ type: 'cellIs', operator: op as ExcelJS.CellIsRuleType['operator'], formulae: rule.type === 'between' ? [rule.a ?? '0', rule.b ?? '0'] : [rule.a ?? '0'], style, priority: 1 } as ExcelJS.CellIsRuleType] })
      else if (rule.type === 'contains') ws.addConditionalFormatting({ ref: ref(rule.range), rules: [{ type: 'containsText', operator: 'containsText', text: rule.a ?? '', style, priority: 1 } as ExcelJS.ContainsTextRuleType] })
    }
  })
  const buf = await out.xlsx.writeBuffer()
  return new Blob([buf as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function exportCsv(sheet: Sheet, wb: Workbook, si: number, display: (v: V, fmt?: string) => string, delimiter = ';'): Blob {
  const calc = new Calc(wb)
  let maxR = 0, maxC = 0
  for (const k of Object.keys(sheet.cells)) {
    const [r, c] = k.split(',').map(Number) as [number, number]
    maxR = Math.max(maxR, r + 1); maxC = Math.max(maxC, c + 1)
  }
  const lines: string[] = []
  for (let r = 0; r < maxR; r++) {
    const row: string[] = []
    for (let c = 0; c < maxC; c++) {
      const t = display(calc.value(si, r, c), sheet.cells[key(r, c)]?.s?.fmt)
      row.push(/[";\n,]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)
    }
    lines.push(row.join(delimiter))
  }
  return new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

void DEFAULT_COL_W; void DEFAULT_ROW_H; void rewriteRefs
