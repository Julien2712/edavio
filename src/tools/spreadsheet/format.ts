import { FErr, type V } from './formula'

/** Excel serial date (1900 system) helpers */
const EPOCH = Date.UTC(1899, 11, 30)
export const serialToDate = (n: number) => new Date(EPOCH + Math.round(n * 86400000))
export const dateToSerial = (d: Date) => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - EPOCH) / 86400000

const pad = (n: number, l = 2) => String(n).padStart(l, '0')
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export const NUMBER_FORMATS: { id: string; label: string; code: string; sample: string }[] = [
  { id: 'general', label: 'Standard', code: 'General', sample: '1234,5' },
  { id: 'number', label: 'Nombre', code: '#,##0.00', sample: '1 234,50' },
  { id: 'integer', label: 'Entier', code: '0', sample: '1235' },
  { id: 'currency', label: 'Monétaire (€)', code: '#,##0.00 "€"', sample: '1 234,50 €' },
  { id: 'usd', label: 'Monétaire ($)', code: '"$"#,##0.00', sample: '$1,234.50' },
  { id: 'percent', label: 'Pourcentage', code: '0.00%', sample: '12,35 %' },
  { id: 'date', label: 'Date courte', code: 'dd/mm/yyyy', sample: '31/12/2025' },
  { id: 'datelong', label: 'Date longue', code: 'dddd d mmmm yyyy', sample: 'mercredi 31 décembre 2025' },
  { id: 'time', label: 'Heure', code: 'hh:mm:ss', sample: '13:45:00' },
  { id: 'sci', label: 'Scientifique', code: '0.00E+00', sample: '1,23E+03' },
  { id: 'text', label: 'Texte', code: '@', sample: 'abc' },
]

export const isDateFormat = (code: string) => /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^[#0,.\s%]*$/.test(code) && !/E[+-]/i.test(code)

/** decimal separator used for display: French by default */
const DEC = ','
const THOU = ' '

function groupInt(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, THOU)
}

export function formatGeneral(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n) && Math.abs(n) < 1e11) return String(n)
  const abs = Math.abs(n)
  if (abs >= 1e11 || (abs < 1e-4 && abs > 0)) return n.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E').replace('.', DEC)
  return String(Number(n.toPrecision(10))).replace('.', DEC)
}

function formatNumberSection(n: number, code: string, negParen = false): string {
  void negParen
  let pct = 0
  const percent = /%/.test(code)
  if (percent) pct = 100
  const sci = code.match(/0(?:\.0+)?E[+-]0+/i)
  const x = percent ? n * pct : n
  // split into literal prefix / numeric pattern / suffix
  const parts: { lit?: string; num?: string }[] = []
  let i = 0
  let buf = ''
  let inNum = false
  const flush = (num: boolean) => {
    if (buf) parts.push(num ? { num: buf } : { lit: buf })
    buf = ''
  }
  while (i < code.length) {
    const ch = code[i]!
    if (ch === '"') {
      const j = code.indexOf('"', i + 1)
      if (inNum) { flush(true); inNum = false }
      buf += code.slice(i + 1, j < 0 ? code.length : j)
      i = j < 0 ? code.length : j + 1
      continue
    }
    if (ch === '\\') { if (inNum) { flush(true); inNum = false } buf += code[i + 1] ?? ''; i += 2; continue }
    if (ch === '[') { const j = code.indexOf(']', i); const inner = code.slice(i + 1, j); if (/^[$€£]/.test(inner)) buf += inner.replace(/-.*$/, '').replace(/^\$/, '$'); i = j + 1; continue }
    if ('0#?.,'.includes(ch) || (sci && /[eE+-]/.test(ch) && inNum)) {
      if (!inNum) { flush(false); inNum = true }
      buf += ch
    } else if (ch === '%') {
      if (inNum) { flush(true); inNum = false }
      buf += '%'
    } else {
      if (inNum) { flush(true); inNum = false }
      buf += ch === '_' ? ' ' : ch
      if (ch === '_') i++
    }
    i++
  }
  flush(inNum)
  let out = ''
  for (const p of parts) {
    if (p.lit !== undefined) { out += p.lit; continue }
    const pat = p.num!
    if (sci) {
      const [mant, exp] = pat.split(/E/i)
      const dec = (mant!.split('.')[1] ?? '').length
      const expDigits = (exp ?? '+00').replace(/[+-]/, '').length
      if (x === 0) { out += (0).toFixed(dec).replace('.', DEC) + 'E+' + pad(0, expDigits); continue }
      const e = Math.floor(Math.log10(Math.abs(x)))
      const m = x / Math.pow(10, e)
      out += m.toFixed(dec).replace('.', DEC) + 'E' + (e < 0 ? '-' : '+') + pad(Math.abs(e), expDigits)
      continue
    }
    const [ip, fp = ''] = pat.replace(/,/g, '').split('.')
    const thousands = pat.includes(',') && !/^,+$/.test(pat)
    const trailingCommas = (pat.match(/,+$/) ?? [''])[0].length
    let v = Math.abs(x) / Math.pow(1000, trailingCommas && !pat.includes('.') ? trailingCommas : 0)
    const minDec = (fp.match(/0/g) ?? []).length
    const maxDec = fp.length
    const fixed = v.toFixed(maxDec)
    let [wi, wd = ''] = fixed.split('.')
    wd = wd.replace(/0+$/, '')
    while (wd.length < minDec) wd += '0'
    const minInt = (ip!.match(/0/g) ?? []).length
    wi = wi!.padStart(minInt, '0')
    if (minInt === 0 && wi === '0' && (ip ?? '').length > 0 && wd) wi = ''
    if (thousands) wi = groupInt(wi)
    out += wi + (wd ? DEC + wd : '')
    v = 0
  }
  return out
}

function formatDate(n: number, code: string): string {
  const d = serialToDate(n)
  const Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), W = d.getUTCDay()
  let H = d.getUTCHours()
  const mi = d.getUTCMinutes(), se = d.getUTCSeconds()
  const ampm = /AM\/PM|A\/P/i.test(code)
  if (ampm) H = H % 12 || 12
  let out = ''
  const re = /"([^"]*)"|\\(.)|\[[^\]]*\]|(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P)|(.)/gi
  let m: RegExpExecArray | null
  const tokens: { t: string; lit: boolean }[] = []
  while ((m = re.exec(code))) {
    if (m[1] !== undefined) tokens.push({ t: m[1], lit: true })
    else if (m[2] !== undefined) tokens.push({ t: m[2], lit: true })
    else if (m[3]) tokens.push({ t: m[3], lit: false })
    else if (m[4] !== undefined) tokens.push({ t: m[4], lit: true })
  }
  tokens.forEach((tk, i) => {
    if (tk.lit) { out += tk.t; return }
    const t = tk.t.toLowerCase()
    switch (t) {
      case 'yyyy': out += pad(Y, 4); break
      case 'yy': out += pad(Y % 100); break
      case 'mmmm': out += MONTHS[M]; break
      case 'mmm': out += MONTHS[M]!.slice(0, 4).replace(/\.$/, '') + (MONTHS[M]!.length > 4 ? '.' : ''); break
      case 'mm': case 'm': {
        // minutes when adjacent to h or s
        const prev = tokens.slice(0, i).reverse().find((x) => !x.lit)?.t.toLowerCase()
        const next = tokens.slice(i + 1).find((x) => !x.lit)?.t.toLowerCase()
        const isMin = prev === 'h' || prev === 'hh' || next === 's' || next === 'ss'
        const val = isMin ? mi : M + 1
        out += t === 'mm' ? pad(val) : String(val)
        break
      }
      case 'dddd': out += DAYS[W]; break
      case 'ddd': out += DAYS[W]!.slice(0, 3) + '.'; break
      case 'dd': out += pad(D); break
      case 'd': out += String(D); break
      case 'hh': out += pad(H); break
      case 'h': out += String(H); break
      case 'ss': out += pad(se); break
      case 's': out += String(se); break
      case 'am/pm': case 'a/p': out += d.getUTCHours() >= 12 ? 'PM' : 'AM'; break
    }
  })
  return out
}

export interface Formatted {
  text: string
  /** natural alignment when the cell has no explicit one */
  align: 'left' | 'right' | 'center'
  color?: string
}

export function formatValue(v: V, code?: string): Formatted {
  if (v === null || v === undefined || v === '') return { text: '', align: 'left' }
  if (v instanceof FErr) return { text: v.code, align: 'center', color: '#dc2626' }
  if (typeof v === 'boolean') return { text: v ? 'VRAI' : 'FAUX', align: 'center' }
  if (typeof v === 'string') return { text: v, align: 'left' }
  if (!code || code === 'General') return { text: formatGeneral(v), align: 'right' }
  if (code === '@') return { text: String(v), align: 'left' }
  const sections = code.split(';')
  let sec = sections[0]!
  let n = v
  let color: string | undefined
  if (v < 0 && sections.length > 1) { sec = sections[1]!; n = -v }
  else if (v === 0 && sections.length > 2) sec = sections[2]!
  const col = sec.match(/\[(Red|Rouge|Green|Vert|Blue|Bleu)\]/i)
  if (col) color = /red|rouge/i.test(col[1]!) ? '#dc2626' : /green|vert/i.test(col[1]!) ? '#16a34a' : '#2563eb'
  if (isDateFormat(sec)) return { text: formatDate(n, sec), align: 'right', color }
  const text = formatNumberSection(n, sec)
  return { text: (v < 0 && sections.length === 1 ? '-' : '') + text, align: 'right', color }
}

/** Parses text typed by the user into a typed cell value (number, date, percent…) when it looks like one. */
export function parseTyped(input: string): { num: number; fmt?: string } | null {
  const s = input.trim()
  if (!s) return null
  let m = s.match(/^[-+]?\d+(?:[.,]\d+)?%$/)
  if (m) return { num: parseFloat(s.replace(',', '.')) / 100, fmt: s.includes('.') || s.includes(',') ? '0.00%' : '0%' }
  m = s.match(/^[-+]?\d{1,3}(?:[\s ]\d{3})+(?:[.,]\d+)?$/)
  if (m) return { num: parseFloat(s.replace(/[\s ]/g, '').replace(',', '.')) }
  m = s.match(/^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][-+]?\d+)?$/)
  if (m) return { num: parseFloat(s.replace(',', '.')) }
  m = s.match(/^([-+]?\d+(?:[.,]\d+)?)\s*(€|\$)$/)
  if (m) return { num: parseFloat(m[1]!.replace(',', '.')), fmt: m[2] === '€' ? '#,##0.00 "€"' : '"$"#,##0.00' }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
    const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])))
    if (d.getUTCMonth() === Number(m[2]) - 1) return { num: (d.getTime() - EPOCH) / 86400000, fmt: 'dd/mm/yyyy' }
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    return { num: (d.getTime() - EPOCH) / 86400000, fmt: 'dd/mm/yyyy' }
  }
  m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m) return { num: (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0)) / 86400, fmt: 'hh:mm:ss' }
  return null
}
