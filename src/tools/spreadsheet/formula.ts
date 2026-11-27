import { colIndex, colName, key, type Workbook } from './model'
import { dateToSerial, formatValue, serialToDate } from './format'

export class FErr {
  code: string
  constructor(code: string) {
    this.code = code
  }
  toString() {
    return this.code
  }
}
export const E = {
  DIV0: new FErr('#DIV/0!'), VALUE: new FErr('#VALUE!'), REF: new FErr('#REF!'), NAME: new FErr('#NAME?'),
  NA: new FErr('#N/A'), NUM: new FErr('#NUM!'), CIRC: new FErr('#CIRC!'),
}

export type V = number | string | boolean | FErr | null
type Arr = V[][]
type Val = V | Arr

// ── Tokenizer ────────────────────────────────────────────────────────────────

interface Tok { t: 'num' | 'str' | 'id' | 'op' | 'ref' | 'lp' | 'rp' | 'sep'; v: string }

const REF_RE = /^(?:(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?(?![\w(])/
const COLRANGE_RE = /^(?:(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}(?![\w(])/
const ROWRANGE_RE = /^(?:(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?\$?\d+:\$?\d+(?![\w(.])/

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) { i++; continue }
    const rest = src.slice(i)
    if (ch === '"') {
      let j = i + 1, s = ''
      while (j < src.length) {
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue } break }
        s += src[j++]
      }
      out.push({ t: 'str', v: s })
      i = j + 1
      continue
    }
    let m = rest.match(/^\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|^\.\d+(?:[eE][+-]?\d+)?/)
    if (m && !/^[A-Za-z]/.test(rest)) {
      // a number directly followed by a ref-like letter is a ref (e.g. nothing) – plain number
      const refm = rest.match(ROWRANGE_RE)
      if (refm) { out.push({ t: 'ref', v: refm[0] }); i += refm[0].length; continue }
      out.push({ t: 'num', v: m[0] }); i += m[0].length; continue
    }
    m = rest.match(REF_RE) ?? rest.match(COLRANGE_RE)
    if (m) { out.push({ t: 'ref', v: m[0] }); i += m[0].length; continue }
    m = rest.match(/^'(?:[^']|'')+'!/)
    if (m) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue }
    m = rest.match(/^[A-Za-z_][\w.]*/)
    if (m) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue }
    if (ch === '(') { out.push({ t: 'lp', v: ch }); i++; continue }
    if (ch === ')') { out.push({ t: 'rp', v: ch }); i++; continue }
    if (ch === ',' || ch === ';') { out.push({ t: 'sep', v: ch }); i++; continue }
    const two = src.slice(i, i + 2)
    if (['<=', '>=', '<>'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue }
    if ('+-*/^&=<>%:'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue }
    throw new Error('syntax')
  }
  return out
}

// ── Parser ───────────────────────────────────────────────────────────────────

type Node =
  | { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'bool'; v: boolean } | { k: 'err'; v: FErr }
  | { k: 'ref'; sheet?: string; r1: number; c1: number; r2: number; c2: number }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'bin'; op: string; a: Node; b: Node } | { k: 'un'; op: string; a: Node } | { k: 'pct'; a: Node } | { k: 'empty' }

function unquote(s: string) { return s.startsWith("'") ? s.slice(1, -1).replace(/''/g, "'") : s }

export function parseRefToken(tok: string): { sheet?: string; r1: number; c1: number; r2: number; c2: number } {
  let sheet: string | undefined
  let body = tok
  const bang = tok.lastIndexOf('!')
  if (bang >= 0) { sheet = unquote(tok.slice(0, bang)); body = tok.slice(bang + 1) }
  body = body.replace(/\$/g, '')
  const [a, b = a] = body.split(':')
  const pa = parseEnd(a!), pb = parseEnd(b!)
  return { sheet, r1: pa.r ?? 0, c1: pa.c ?? 0, r2: pb.r ?? 1048575, c2: pb.c ?? 16383 }
}
function parseEnd(s: string): { r?: number; c?: number } {
  const m = s.match(/^([A-Za-z]*)(\d*)$/)!
  return { c: m[1] ? colIndex(m[1]) : undefined, r: m[2] ? parseInt(m[2], 10) - 1 : undefined }
}

class Parser {
  i = 0
  private toks: Tok[]
  constructor(toks: Tok[]) {
    this.toks = toks
  }
  peek() { return this.toks[this.i] }
  next() { return this.toks[this.i++] }
  isOp(...ops: string[]) { const t = this.peek(); return !!t && t.t === 'op' && ops.includes(t.v) }

  parse(): Node {
    const n = this.cmp()
    if (this.i < this.toks.length) throw new Error('syntax')
    return n
  }
  cmp(): Node {
    let a = this.concat()
    while (this.isOp('=', '<>', '<', '>', '<=', '>=')) { const op = this.next()!.v; a = { k: 'bin', op, a, b: this.concat() } }
    return a
  }
  concat(): Node {
    let a = this.add()
    while (this.isOp('&')) { this.next(); a = { k: 'bin', op: '&', a, b: this.add() } }
    return a
  }
  add(): Node {
    let a = this.mul()
    while (this.isOp('+', '-')) { const op = this.next()!.v; a = { k: 'bin', op, a, b: this.mul() } }
    return a
  }
  mul(): Node {
    let a = this.pow()
    while (this.isOp('*', '/')) { const op = this.next()!.v; a = { k: 'bin', op, a, b: this.pow() } }
    return a
  }
  pow(): Node {
    let a = this.unary()
    while (this.isOp('^')) { this.next(); a = { k: 'bin', op: '^', a, b: this.unary() } }
    return a
  }
  unary(): Node {
    if (this.isOp('-', '+')) { const op = this.next()!.v; return { k: 'un', op, a: this.unary() } }
    return this.postfix()
  }
  postfix(): Node {
    let a = this.primary()
    while (this.isOp('%')) { this.next(); a = { k: 'pct', a } }
    return a
  }
  primary(): Node {
    const t = this.next()
    if (!t) throw new Error('syntax')
    if (t.t === 'num') return { k: 'num', v: parseFloat(t.v) }
    if (t.t === 'str') return { k: 'str', v: t.v }
    if (t.t === 'ref') return { k: 'ref', ...parseRefToken(t.v) }
    if (t.t === 'lp') { const n = this.cmp(); if (this.next()?.t !== 'rp') throw new Error('syntax'); return n }
    if (t.t === 'id') {
      const up = t.v.toUpperCase()
      if (this.peek()?.t === 'lp') {
        this.next()
        const args: Node[] = []
        if (this.peek()?.t === 'rp') { this.next(); return { k: 'call', name: up, args } }
        for (;;) {
          if (this.peek()?.t === 'sep' || this.peek()?.t === 'rp') args.push({ k: 'empty' })
          else args.push(this.cmp())
          const n = this.next()
          if (n?.t === 'rp') break
          if (n?.t !== 'sep') throw new Error('syntax')
        }
        return { k: 'call', name: up, args }
      }
      if (up === 'TRUE' || up === 'VRAI') return { k: 'bool', v: true }
      if (up === 'FALSE' || up === 'FAUX') return { k: 'bool', v: false }
      if (t.v.endsWith('!')) throw new Error('syntax')
      return { k: 'err', v: E.NAME }
    }
    throw new Error('syntax')
  }
}

const astCache = new Map<string, Node | null>()
function parseFormula(f: string): Node | null {
  if (astCache.has(f)) return astCache.get(f)!
  let n: Node | null = null
  try { n = new Parser(tokenize(f.slice(1))).parse() } catch { n = null }
  if (astCache.size > 5000) astCache.clear()
  astCache.set(f, n)
  return n
}

// ── Coercion ─────────────────────────────────────────────────────────────────

export const isErr = (v: unknown): v is FErr => v instanceof FErr

function toNum(v: V): number | FErr {
  if (v instanceof FErr) return v
  if (v === null || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const s = v.trim().replace(',', '.')
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return parseFloat(s)
  if (/^[-+]?\d+(\.\d+)?%$/.test(s)) return parseFloat(s) / 100
  return E.VALUE
}
export function toText(v: V): string {
  if (v === null) return ''
  if (v instanceof FErr) return v.code
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return formatValue(v).text.replace(/ /g, '').replace(',', '.')
  return v
}
function toBool(v: V): boolean | FErr {
  if (v instanceof FErr) return v
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null || v === '') return false
  const u = v.toUpperCase()
  if (u === 'TRUE' || u === 'VRAI') return true
  if (u === 'FALSE' || u === 'FAUX') return false
  return E.VALUE
}

function compare(a: V, b: V): number {
  const rank = (v: V) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 0)
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0
  const ra = rank(a), rb = rank(b)
  if (ra !== rb) return ra - rb
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase().localeCompare(b.toLowerCase())
  return Number(a) - Number(b)
}

// ── Evaluation ───────────────────────────────────────────────────────────────

interface Fn { lazy?: boolean; fn: (args: Val[], ctx: EvalCtx, nodes?: Node[]) => Val }

interface EvalCtx { calc: Calc; sheet: number; row: number; col: number }

const isArr = (v: Val | undefined): v is Arr => Array.isArray(v)
const scalar = (v: Val | undefined): V => (isArr(v) ? v[0]?.[0] ?? null : v === undefined ? null : v)

function mapArr(a: Val, b: Val, f: (x: V, y: V) => V): Val {
  if (!isArr(a) && !isArr(b)) return f(a as V, b as V)
  const A = isArr(a) ? a : null, B = isArr(b) ? b : null
  const rows = Math.max(A?.length ?? 1, B?.length ?? 1)
  const cols = Math.max(A?.[0]?.length ?? 1, B?.[0]?.length ?? 1)
  const out: Arr = []
  for (let r = 0; r < rows; r++) {
    const row: V[] = []
    for (let c = 0; c < cols; c++) {
      const x = A ? A[A.length === 1 ? 0 : r]?.[A[0]!.length === 1 ? 0 : c] ?? null : (a as V)
      const y = B ? B[B.length === 1 ? 0 : r]?.[B[0]!.length === 1 ? 0 : c] ?? null : (b as V)
      row.push(f(x, y))
    }
    out.push(row)
  }
  return out
}

function binop(op: string, x: V, y: V): V {
  if (x instanceof FErr) return x
  if (y instanceof FErr) return y
  switch (op) {
    case '&': return toText(x) + toText(y)
    case '=': return compare(x, y) === 0
    case '<>': return compare(x, y) !== 0
    case '<': return compare(x, y) < 0
    case '>': return compare(x, y) > 0
    case '<=': return compare(x, y) <= 0
    case '>=': return compare(x, y) >= 0
  }
  const a = toNum(x), b = toNum(y)
  if (a instanceof FErr) return a
  if (b instanceof FErr) return b
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? E.DIV0 : a / b
    case '^': { const r = Math.pow(a, b); return Number.isNaN(r) ? E.NUM : r }
  }
  return E.VALUE
}

function evalNode(n: Node, ctx: EvalCtx): Val {
  switch (n.k) {
    case 'num': return n.v
    case 'str': return n.v
    case 'bool': return n.v
    case 'err': return n.v
    case 'empty': return null
    case 'ref': {
      const si = n.sheet ? ctx.calc.sheetIndex(n.sheet) : ctx.sheet
      if (si < 0) return E.REF
      if (n.r1 === n.r2 && n.c1 === n.c2) return ctx.calc.value(si, n.r1, n.c1)
      return ctx.calc.range(si, n.r1, n.c1, n.r2, n.c2)
    }
    case 'un': {
      const v = evalNode(n.a, ctx)
      return mapArr(v, 0, (x) => { if (n.op === '+') return x; const k = toNum(x); return k instanceof FErr ? k : -k })
    }
    case 'pct': {
      return mapArr(evalNode(n.a, ctx), 0, (x) => { const k = toNum(x); return k instanceof FErr ? k : k / 100 })
    }
    case 'bin': return mapArr(evalNode(n.a, ctx), evalNode(n.b, ctx), (x, y) => binop(n.op, x, y))
    case 'call': {
      const name = ALIAS[n.name] ?? n.name
      const f = FUNCS[name]
      if (!f) return E.NAME
      if (f.lazy) return f.fn([], ctx, n.args)
      const args = n.args.map((a) => evalNode(a, ctx))
      return f.fn(args, ctx, n.args)
    }
  }
}

export class Calc {
  private cache = new Map<string, V>()
  private stack = new Set<string>()
  private extents = new Map<number, { rows: number; cols: number }>()
  private names = new Map<string, number>()
  wb: Workbook
  constructor(wb: Workbook) {
    this.wb = wb
    wb.sheets.forEach((s, i) => this.names.set(s.name.toLowerCase(), i))
  }
  sheetIndex(name: string) { return this.names.get(name.toLowerCase()) ?? -1 }
  private extent(si: number) {
    let e = this.extents.get(si)
    if (!e) {
      let rows = 0, cols = 0
      for (const k of Object.keys(this.wb.sheets[si]!.cells)) {
        const [r, c] = k.split(',').map(Number) as [number, number]
        if (r + 1 > rows) rows = r + 1
        if (c + 1 > cols) cols = c + 1
      }
      e = { rows, cols }
      this.extents.set(si, e)
    }
    return e
  }
  value(si: number, r: number, c: number): V {
    const sheet = this.wb.sheets[si]
    if (!sheet || r < 0 || c < 0) return E.REF
    const cell = sheet.cells[key(r, c)]
    if (!cell || cell.v === '') return null
    const raw = cell.v
    if (raw[0] !== '=') return literal(raw)
    const k = `${si}:${r},${c}`
    const hit = this.cache.get(k)
    if (hit !== undefined) return hit
    if (this.stack.has(k)) return E.CIRC
    this.stack.add(k)
    let out: V
    try {
      const ast = parseFormula(raw)
      if (!ast) out = E.NAME
      else {
        const v = evalNode(ast, { calc: this, sheet: si, row: r, col: c })
        out = isArr(v) ? v[0]?.[0] ?? null : v
        if (typeof out === 'number' && !Number.isFinite(out)) out = E.NUM
      }
    } catch {
      out = E.VALUE
    } finally {
      this.stack.delete(k)
    }
    this.cache.set(k, out)
    return out
  }
  range(si: number, r1: number, c1: number, r2: number, c2: number): Arr {
    const ext = this.extent(si)
    const rr2 = Math.min(r2, Math.max(ext.rows - 1, r1)), cc2 = Math.min(c2, Math.max(ext.cols - 1, c1))
    const out: Arr = []
    for (let r = r1; r <= rr2; r++) {
      const row: V[] = []
      for (let c = c1; c <= cc2; c++) row.push(this.value(si, r, c))
      out.push(row)
    }
    return out
  }
}

/** Typed value of a raw (non formula) cell string */
export function literal(raw: string): V {
  if (raw[0] === "'") return raw.slice(1)
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(raw)) return parseFloat(raw)
  const u = raw.toUpperCase()
  if (u === 'TRUE' || u === 'VRAI') return true
  if (u === 'FALSE' || u === 'FAUX') return false
  if (raw[0] === '#' && Object.values(E).some((e) => e.code === raw)) return Object.values(E).find((e) => e.code === raw)!
  return raw
}

// ── Helpers for functions ────────────────────────────────────────────────────

function nums(args: Val[], direct = true): number[] | FErr {
  const out: number[] = []
  for (const a of args) {
    if (isArr(a)) {
      for (const row of a) for (const v of row) {
        if (v instanceof FErr) return v
        if (typeof v === 'number') out.push(v)
      }
    } else if (a instanceof FErr) return a
    else if (direct) {
      if (a === null) continue
      const k = toNum(a)
      if (k instanceof FErr) return k
      out.push(k)
    }
  }
  return out
}
const flatten = (a: Val): V[] => (isArr(a) ? a.flat() : [a])
function num1(a: Val | undefined): number | FErr { return toNum(scalar(a ?? null)) }
function str1(a: Val | undefined): string { return toText(scalar(a ?? null)) }

function matcher(crit: V): (v: V) => boolean {
  if (typeof crit === 'number' || typeof crit === 'boolean') return (v) => v !== null && compare(v, crit) === 0 && typeof v === typeof crit
  const s = toText(crit)
  const m = s.match(/^(<=|>=|<>|=|<|>)?([\s\S]*)$/)!
  const op = m[1] ?? '='
  const rest = m[2]!
  const n = toNum(rest)
  const isNum = rest !== '' && !(n instanceof FErr)
  const re = rest.includes('*') || rest.includes('?') ? new RegExp('^' + rest.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null
  return (v) => {
    if (op === '=' || op === '<>') {
      let eq: boolean
      if (isNum && typeof v === 'number') eq = v === n
      else if (re) eq = typeof v === 'string' && re.test(v)
      else eq = rest === '' ? v === null || v === '' : toText(v).toLowerCase() === rest.toLowerCase()
      return op === '=' ? eq : !eq
    }
    if (isNum) {
      if (typeof v !== 'number') return false
      return op === '<' ? v < (n as number) : op === '>' ? v > (n as number) : op === '<=' ? v <= (n as number) : v >= (n as number)
    }
    if (typeof v !== 'string') return false
    const c = v.toLowerCase().localeCompare(rest.toLowerCase())
    return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0
  }
}

function ifFamily(args: Val[], kind: 'sum' | 'count' | 'avg'): Val {
  // (range, crit[, sumRange]) or for *IFS: ([sumRange], (range, crit)+)
  let sumR: Arr | null = null
  let pairs: [Arr, V][] = []
  const plural = (args as unknown as { plural?: boolean }).plural
  if (plural) {
    let rest = args
    if (kind !== 'count') { sumR = args[0] as Arr; rest = args.slice(1) }
    for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i] as Arr, scalar(rest[i + 1]!)])
  } else {
    pairs = [[args[0] as Arr, scalar(args[1] ?? null)]]
    sumR = (args[2] as Arr) ?? (args[0] as Arr)
  }
  const first = pairs[0]?.[0]
  if (!first || !isArr(first)) return E.VALUE
  const ms = pairs.map(([, c]) => matcher(c))
  let total = 0, count = 0
  for (let r = 0; r < first.length; r++) for (let c = 0; c < first[0]!.length; c++) {
    if (!pairs.every(([rg], i) => ms[i]!(rg[r]?.[c] ?? null))) continue
    count++
    if (kind !== 'count') { const v = sumR?.[r]?.[c]; if (typeof v === 'number') total += v; else if (kind === 'avg') count-- }
  }
  if (kind === 'count') return count
  if (kind === 'avg') return count ? total / count : E.DIV0
  return total
}

function lookupKey(a: V) { return typeof a === 'string' ? a.toLowerCase() : a }

function pmt(rate: number, nper: number, pv: number, fv = 0, type = 0) {
  if (rate === 0) return -(pv + fv) / nper
  const p = Math.pow(1 + rate, nper)
  return -(rate * (pv * p + fv)) / ((1 + rate * type) * (p - 1))
}

const toDate = (v: V): Date | FErr => { const n = toNum(v); return n instanceof FErr ? n : serialToDate(n) }

const FUNCS: Record<string, Fn> = {}
const def = (names: string, fn: Fn['fn'], lazy = false) => { for (const n of names.split(' ')) FUNCS[n] = { fn, lazy } }

const agg = (f: (a: number[]) => Val, empty: Val = 0) => (args: Val[]): Val => { const n = nums(args); if (n instanceof FErr) return n; return n.length ? f(n) : empty }

def('SUM', agg((a) => a.reduce((x, y) => x + y, 0)))
def('AVERAGE', agg((a) => a.reduce((x, y) => x + y, 0) / a.length, E.DIV0))
def('MIN', agg((a) => Math.min(...a)))
def('MAX', agg((a) => Math.max(...a)))
def('PRODUCT', agg((a) => a.reduce((x, y) => x * y, 1)))
def('MEDIAN', agg((a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2 }, E.NUM))
def('MODE', agg((a) => { const c = new Map<number, number>(); a.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1)); let best = a[0]!, bc = 0; c.forEach((n, x) => { if (n > bc) { bc = n; best = x } }); return bc > 1 ? best : E.NA }, E.NA))
const variance = (a: number[], sample: boolean) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - (sample ? 1 : 0)) }
def('VAR VAR.S', agg((a) => (a.length > 1 ? variance(a, true) : E.DIV0), E.DIV0))
def('VARP VAR.P', agg((a) => variance(a, false), E.DIV0))
def('STDEV STDEV.S', agg((a) => (a.length > 1 ? Math.sqrt(variance(a, true)) : E.DIV0), E.DIV0))
def('STDEVP STDEV.P', agg((a) => Math.sqrt(variance(a, false)), E.DIV0))
def('COUNT', (args) => { let n = 0; for (const a of args) { if (isArr(a)) a.forEach((r) => r.forEach((v) => { if (typeof v === 'number') n++ })); else if (typeof a === 'number' || (a !== null && !(a instanceof FErr) && toNum(a) === toNum(a) && typeof toNum(a) === 'number' && typeof a !== 'string')) n++; else if (typeof a === 'string' && typeof toNum(a) === 'number') n++ } return n })
def('COUNTA', (args) => { let n = 0; for (const a of args) flatten(a).forEach((v) => { if (v !== null && v !== '') n++ }); return n })
def('COUNTBLANK', (args) => { let n = 0; for (const a of args) flatten(a).forEach((v) => { if (v === null || v === '') n++ }); return n })
def('LARGE', (a) => { const n = nums([a[0]!], false); if (n instanceof FErr) return n; const k = num1(a[1]); if (k instanceof FErr) return k; const s = [...n].sort((x, y) => y - x); return s[k - 1] ?? E.NUM })
def('SMALL', (a) => { const n = nums([a[0]!], false); if (n instanceof FErr) return n; const k = num1(a[1]); if (k instanceof FErr) return k; const s = [...n].sort((x, y) => x - y); return s[k - 1] ?? E.NUM })
def('RANK RANK.EQ', (a) => { const x = num1(a[0]); if (x instanceof FErr) return x; const n = nums([a[1]!], false); if (n instanceof FErr) return n; const asc = a[2] !== undefined && num1(a[2]) !== 0; if (!n.includes(x)) return E.NA; return 1 + n.filter((v) => (asc ? v < x : v > x)).length })
def('SUMPRODUCT', (args) => { const arrs = args.map((a) => flatten(a)); const len = arrs[0]?.length ?? 0; let t = 0; for (let i = 0; i < len; i++) { let p = 1; for (const ar of arrs) { const v = ar[i]; if (v instanceof FErr) return v; p *= typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : 0 } t += p } return t })
def('SUMIF', (a) => ifFamily(a, 'sum'))
def('COUNTIF', (a) => ifFamily(a, 'count'))
def('AVERAGEIF', (a) => ifFamily(a, 'avg'))
for (const [name, kind] of [['SUMIFS', 'sum'], ['COUNTIFS', 'count'], ['AVERAGEIFS', 'avg']] as const) def(name, (a) => { const x = [...a] as Val[] & { plural?: boolean }; x.plural = true; return ifFamily(x, kind) })

const math1 = (f: (x: number) => number) => (a: Val[]): Val => { const x = num1(a[0]); if (x instanceof FErr) return x; const r = f(x); return Number.isNaN(r) ? E.NUM : r }
def('ABS', math1(Math.abs)); def('SQRT', math1(Math.sqrt)); def('EXP', math1(Math.exp)); def('LN', math1(Math.log))
def('LOG10', math1(Math.log10)); def('SIN', math1(Math.sin)); def('COS', math1(Math.cos)); def('TAN', math1(Math.tan)); def('ATAN', math1(Math.atan))
def('ASIN', math1(Math.asin)); def('ACOS', math1(Math.acos)); def('SIGN', math1(Math.sign)); def('INT', math1(Math.floor))
def('DEGREES', math1((x) => (x * 180) / Math.PI)); def('RADIANS', math1((x) => (x * Math.PI) / 180))
def('FACT', math1((x) => { let r = 1; for (let i = 2; i <= Math.floor(x); i++) r *= i; return r }))
def('EVEN', math1((x) => { const s = Math.sign(x) || 1; const c = Math.ceil(Math.abs(x)); return s * (c % 2 ? c + 1 : c) }))
def('ODD', math1((x) => { const s = Math.sign(x) || 1; const c = Math.ceil(Math.abs(x)); return s * (c % 2 ? c : c + 1) }))
def('LOG', (a) => { const x = num1(a[0]); const b = a[1] === undefined ? 10 : num1(a[1]); if (x instanceof FErr) return x; if (b instanceof FErr) return b; const r = Math.log(x) / Math.log(b); return Number.isNaN(r) ? E.NUM : r })
def('PI', () => Math.PI)
def('RAND', () => Math.random())
def('RANDBETWEEN', (a) => { const lo = num1(a[0]), hi = num1(a[1]); if (lo instanceof FErr) return lo; if (hi instanceof FErr) return hi; return Math.floor(lo + Math.random() * (hi - lo + 1)) })
def('MOD', (a) => { const x = num1(a[0]), y = num1(a[1]); if (x instanceof FErr) return x; if (y instanceof FErr) return y; return y === 0 ? E.DIV0 : x - y * Math.floor(x / y) })
def('POWER', (a) => binop('^', scalar(a[0]!), scalar(a[1]!)))
def('QUOTIENT', (a) => { const x = num1(a[0]), y = num1(a[1]); if (x instanceof FErr) return x; if (y instanceof FErr) return y; return y === 0 ? E.DIV0 : Math.trunc(x / y) })
const rounder = (f: (x: number) => number) => (a: Val[]): Val => { const x = num1(a[0]); const d = a[1] === undefined ? 0 : num1(a[1]); if (x instanceof FErr) return x; if (d instanceof FErr) return d; const p = Math.pow(10, d); return f(x * p) / p }
const roundHalf = (x: number) => Math.sign(x) * Math.round(Math.abs(x) + 1e-12)
def('ROUND', rounder(roundHalf)); def('ROUNDUP', rounder((x) => Math.sign(x) * Math.ceil(Math.abs(x) - 1e-12))); def('ROUNDDOWN TRUNC', rounder(Math.trunc))
def('CEILING', (a) => { const x = num1(a[0]), s = a[1] === undefined ? 1 : num1(a[1]); if (x instanceof FErr) return x; if (s instanceof FErr) return s; return s === 0 ? 0 : Math.ceil(x / s) * s })
def('FLOOR', (a) => { const x = num1(a[0]), s = a[1] === undefined ? 1 : num1(a[1]); if (x instanceof FErr) return x; if (s instanceof FErr) return s; return s === 0 ? 0 : Math.floor(x / s) * s })
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
def('GCD', (a) => { const n = nums(a); if (n instanceof FErr) return n; return n.reduce((x, y) => gcd(Math.abs(x), Math.abs(y)), 0) })
def('LCM', (a) => { const n = nums(a); if (n instanceof FErr) return n; return n.reduce((x, y) => (x && y ? Math.abs(x * y) / gcd(Math.abs(x), Math.abs(y)) : 0), 1) })

// logic
FUNCS.IF = { lazy: true, fn: (_a, ctx, nodes = []) => { const c = toBool(scalar(evalNode(nodes[0] ?? { k: 'empty' }, ctx))); if (c instanceof FErr) return c; return c ? (nodes[1] ? evalNode(nodes[1], ctx) : true) : nodes[2] ? evalNode(nodes[2], ctx) : false } }
FUNCS.IFS = { lazy: true, fn: (_a, ctx, nodes = []) => { for (let i = 0; i + 1 < nodes.length; i += 2) { const c = toBool(scalar(evalNode(nodes[i]!, ctx))); if (c instanceof FErr) return c; if (c) return evalNode(nodes[i + 1]!, ctx) } return E.NA } }
FUNCS.IFERROR = { lazy: true, fn: (_a, ctx, nodes = []) => { const v = evalNode(nodes[0]!, ctx); return isErr(scalar(v)) ? evalNode(nodes[1] ?? { k: 'str', v: '' }, ctx) : v } }
FUNCS.IFNA = { lazy: true, fn: (_a, ctx, nodes = []) => { const v = evalNode(nodes[0]!, ctx); return scalar(v) === E.NA || (isErr(scalar(v)) && (scalar(v) as FErr).code === '#N/A') ? evalNode(nodes[1]!, ctx) : v } }
FUNCS.SWITCH = { lazy: true, fn: (_a, ctx, nodes = []) => { const x = scalar(evalNode(nodes[0]!, ctx)); let i = 1; for (; i + 1 < nodes.length; i += 2) if (compare(x, scalar(evalNode(nodes[i]!, ctx))) === 0) return evalNode(nodes[i + 1]!, ctx); return i < nodes.length ? evalNode(nodes[i]!, ctx) : E.NA } }
FUNCS.CHOOSE = { lazy: true, fn: (_a, ctx, nodes = []) => { const i = toNum(scalar(evalNode(nodes[0]!, ctx))); if (i instanceof FErr) return i; const n = nodes[Math.floor(i)]; return n && i >= 1 ? evalNode(n, ctx) : E.VALUE } }
const boolFold = (f: (b: boolean[]) => boolean) => (args: Val[]): Val => { const out: boolean[] = []; for (const a of args) for (const v of flatten(a)) { if (v === null || (isArr(a) && typeof v === 'string')) continue; const b = toBool(v); if (b instanceof FErr) return b; out.push(b) } return out.length ? f(out) : E.VALUE }
def('AND', boolFold((b) => b.every(Boolean))); def('OR', boolFold((b) => b.some(Boolean))); def('XOR', boolFold((b) => b.filter(Boolean).length % 2 === 1))
def('NOT', (a) => { const b = toBool(scalar(a[0] ?? null)); return b instanceof FErr ? b : !b })
def('TRUE', () => true); def('FALSE', () => false)
def('ISBLANK', (a) => scalar(a[0] ?? null) === null)
def('ISNUMBER', (a) => typeof scalar(a[0] ?? null) === 'number')
def('ISTEXT', (a) => typeof scalar(a[0] ?? null) === 'string')
def('ISLOGICAL', (a) => typeof scalar(a[0] ?? null) === 'boolean')
def('ISERROR', (a) => isErr(scalar(a[0] ?? null)))
def('ISNA', (a) => { const v = scalar(a[0] ?? null); return isErr(v) && v.code === '#N/A' })
def('ISEVEN', (a) => { const n = num1(a[0]); return n instanceof FErr ? n : Math.floor(n) % 2 === 0 })
def('ISODD', (a) => { const n = num1(a[0]); return n instanceof FErr ? n : Math.floor(n) % 2 !== 0 })
def('NA', () => E.NA)

// text
def('CONCAT CONCATENATE', (a) => a.flatMap(flatten).map(toText).join(''))
def('TEXTJOIN', (a) => { const d = str1(a[0]); const skip = toBool(scalar(a[1] ?? null)) === true; return a.slice(2).flatMap(flatten).filter((v) => !(skip && (v === null || v === ''))).map(toText).join(d) })
def('LEFT', (a) => { const n = a[1] === undefined ? 1 : num1(a[1]); return n instanceof FErr ? n : str1(a[0]).slice(0, Math.max(0, n)) })
def('RIGHT', (a) => { const n = a[1] === undefined ? 1 : num1(a[1]); if (n instanceof FErr) return n; const s = str1(a[0]); return n <= 0 ? '' : s.slice(-n) })
def('MID', (a) => { const s = num1(a[1]), n = num1(a[2]); if (s instanceof FErr) return s; if (n instanceof FErr) return n; return s < 1 ? E.VALUE : str1(a[0]).substr(s - 1, Math.max(0, n)) })
def('LEN', (a) => str1(a[0]).length)
def('UPPER', (a) => str1(a[0]).toUpperCase()); def('LOWER', (a) => str1(a[0]).toLowerCase())
def('PROPER', (a) => str1(a[0]).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_m, p, c: string) => p + c.toUpperCase()))
def('TRIM', (a) => str1(a[0]).replace(/\s+/g, ' ').trim()); def('CLEAN', (a) => str1(a[0]).replace(/[\x00-\x1f]/g, ''))
def('SUBSTITUTE', (a) => { const s = str1(a[0]), o = str1(a[1]), n = str1(a[2]); if (!o) return s; if (a[3] === undefined) return s.split(o).join(n); const k = num1(a[3]); if (k instanceof FErr) return k; let c = 0; let out = ''; let i = 0; for (;;) { const j = s.indexOf(o, i); if (j < 0) { out += s.slice(i); break } c++; out += s.slice(i, j) + (c === k ? n : o); i = j + o.length } return out })
def('REPLACE', (a) => { const s = str1(a[0]), p = num1(a[1]), l = num1(a[2]); if (p instanceof FErr) return p; if (l instanceof FErr) return l; return s.slice(0, p - 1) + str1(a[3]) + s.slice(p - 1 + l) })
def('FIND', (a) => { const i = str1(a[1]).indexOf(str1(a[0]), a[2] === undefined ? 0 : Number(num1(a[2])) - 1); return i < 0 ? E.VALUE : i + 1 })
def('SEARCH', (a) => { const i = str1(a[1]).toLowerCase().indexOf(str1(a[0]).toLowerCase(), a[2] === undefined ? 0 : Number(num1(a[2])) - 1); return i < 0 ? E.VALUE : i + 1 })
def('REPT', (a) => { const n = num1(a[1]); return n instanceof FErr ? n : str1(a[0]).repeat(Math.max(0, n)) })
def('EXACT', (a) => str1(a[0]) === str1(a[1]))
def('CHAR', (a) => { const n = num1(a[0]); return n instanceof FErr ? n : String.fromCharCode(n) })
def('CODE UNICODE', (a) => str1(a[0]).charCodeAt(0) || E.VALUE)
def('VALUE', (a) => { const v = toNum(scalar(a[0] ?? null)); return v })
def('TEXT', (a) => { const n = toNum(scalar(a[0] ?? null)); if (n instanceof FErr) return str1(a[0]); return formatValue(n, str1(a[1]).replace(/jj/gi, 'dd').replace(/aaaa/gi, 'yyyy')).text })
def('T', (a) => { const v = scalar(a[0] ?? null); return typeof v === 'string' ? v : '' })
def('N', (a) => { const v = toNum(scalar(a[0] ?? null)); return v instanceof FErr ? 0 : v })

// lookup
def('VLOOKUP', (a) => { const t = a[1]; if (!isArr(t)) return E.REF; const x = scalar(a[0]!), ci = num1(a[2]); if (ci instanceof FErr) return ci; const exact = a[3] !== undefined && toBool(scalar(a[3])) === false; if (ci < 1 || ci > (t[0]?.length ?? 0)) return E.REF
  if (exact) { const row = t.find((r) => compare(r[0] ?? null, x) === 0 && lookupKey(r[0] ?? null) === lookupKey(x)); return row ? row[ci - 1] ?? null : E.NA }
  let best: V[] | null = null; for (const r of t) { if (compare(r[0] ?? null, x) <= 0) best = r; else break } return best ? best[ci - 1] ?? null : E.NA })
def('HLOOKUP', (a) => { const t = a[1]; if (!isArr(t)) return E.REF; const x = scalar(a[0]!), ri = num1(a[2]); if (ri instanceof FErr) return ri; const exact = a[3] !== undefined && toBool(scalar(a[3])) === false; const head = t[0] ?? []; if (ri < 1 || ri > t.length) return E.REF
  let idx = -1; if (exact) idx = head.findIndex((v) => compare(v, x) === 0); else head.forEach((v, i) => { if (compare(v, x) <= 0) idx = i }); return idx < 0 ? E.NA : t[ri - 1]![idx] ?? null })
def('XLOOKUP', (a) => { const x = scalar(a[0]!); const look = flatten(a[1]!), ret = a[2]; if (!isArr(ret)) return E.REF; const flatRet = (a[1] as Arr).length === 1 && (a[1] as Arr)[0]!.length > 1 ? ret[0]! : ret.map((r) => r[0] ?? null); const i = look.findIndex((v) => compare(v, x) === 0); return i < 0 ? (a[3] !== undefined ? scalar(a[3]) : E.NA) : flatRet[i] ?? null })
def('LOOKUP', (a) => { const x = scalar(a[0]!); const look = flatten(a[1]!); const res = a[2] ? flatten(a[2]) : look; let idx = -1; look.forEach((v, i) => { if (compare(v, x) <= 0) idx = i }); return idx < 0 ? E.NA : res[idx] ?? null })
def('MATCH', (a) => { const x = scalar(a[0]!); const arr = flatten(a[1]!); const t = a[2] === undefined ? 1 : num1(a[2]); if (t instanceof FErr) return t
  if (t === 0) { const i = arr.findIndex((v) => compare(v, x) === 0 && lookupKey(v) === lookupKey(x)); return i < 0 ? E.NA : i + 1 }
  let idx = -1; if (t > 0) arr.forEach((v, i) => { if (compare(v, x) <= 0) idx = i }); else arr.forEach((v, i) => { if (compare(v, x) >= 0 && idx < 0) idx = i }); return idx < 0 ? E.NA : idx + 1 })
def('INDEX', (a) => { const t = a[0]!; const arr: Arr = isArr(t) ? t : [[t]]; const r = a[1] === undefined ? 0 : num1(a[1]); const c = a[2] === undefined ? 0 : num1(a[2]); if (r instanceof FErr) return r; if (c instanceof FErr) return c
  if (arr.length === 1 && a[2] === undefined) return arr[0]![r - 1] ?? E.REF
  if (r === 0 && c > 0) return arr.map((row) => [row[c - 1] ?? null]); if (c === 0 && r > 0) return [arr[r - 1] ?? []]
  return arr[Math.max(r, 1) - 1]?.[Math.max(c, 1) - 1] ?? E.REF })
FUNCS.ROW = { lazy: true, fn: (_a, ctx, nodes = []) => { const n = nodes[0]; return n && n.k === 'ref' ? n.r1 + 1 : ctx.row + 1 } }
FUNCS.COLUMN = { lazy: true, fn: (_a, ctx, nodes = []) => { const n = nodes[0]; return n && n.k === 'ref' ? n.c1 + 1 : ctx.col + 1 } }
def('ROWS', (a) => (isArr(a[0]!) ? (a[0] as Arr).length : 1)); def('COLUMNS', (a) => (isArr(a[0]!) ? (a[0] as Arr)[0]?.length ?? 0 : 1))

// dates
def('TODAY', () => Math.floor(dateToSerial(new Date())))
def('NOW', () => dateToSerial(new Date()))
def('DATE', (a) => { const y = num1(a[0]), m = num1(a[1]), d = num1(a[2]); if (y instanceof FErr) return y; if (m instanceof FErr) return m; if (d instanceof FErr) return d; return (Date.UTC(y < 100 ? 1900 + y : y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000 })
const datePart = (f: (d: Date) => number) => (a: Val[]): Val => { const d = toDate(scalar(a[0] ?? null)); return d instanceof FErr ? d : f(d) }
def('YEAR', datePart((d) => d.getUTCFullYear())); def('MONTH', datePart((d) => d.getUTCMonth() + 1)); def('DAY', datePart((d) => d.getUTCDate()))
def('HOUR', datePart((d) => d.getUTCHours())); def('MINUTE', datePart((d) => d.getUTCMinutes())); def('SECOND', datePart((d) => d.getUTCSeconds()))
def('WEEKDAY', (a) => { const d = toDate(scalar(a[0] ?? null)); if (d instanceof FErr) return d; const t = a[1] === undefined ? 1 : num1(a[1]); const w = d.getUTCDay(); return t === 2 ? ((w + 6) % 7) + 1 : t === 3 ? (w + 6) % 7 : w + 1 })
def('DAYS', (a) => { const x = num1(a[0]), y = num1(a[1]); if (x instanceof FErr) return x; if (y instanceof FErr) return y; return Math.floor(x) - Math.floor(y) })
def('EDATE', (a) => { const d = toDate(scalar(a[0] ?? null)); const m = num1(a[1]); if (d instanceof FErr) return d; if (m instanceof FErr) return m; return dateToSerial(new Date(d.getUTCFullYear(), d.getUTCMonth() + m, d.getUTCDate())) })
def('EOMONTH', (a) => { const d = toDate(scalar(a[0] ?? null)); const m = num1(a[1]); if (d instanceof FErr) return d; if (m instanceof FErr) return m; return dateToSerial(new Date(d.getUTCFullYear(), d.getUTCMonth() + m + 1, 0)) })
def('DATEDIF', (a) => { const s = toDate(scalar(a[0] ?? null)), e = toDate(scalar(a[1] ?? null)); if (s instanceof FErr) return s; if (e instanceof FErr) return e; const u = str1(a[2]).toUpperCase(); const months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth() - (e.getUTCDate() < s.getUTCDate() ? 1 : 0)
  return u === 'Y' ? Math.floor(months / 12) : u === 'M' ? months : u === 'D' ? Math.round((e.getTime() - s.getTime()) / 86400000) : E.NUM })

// finance
def('PMT', (a) => { const v = [0, 1, 2, 3, 4].map((i) => (a[i] === undefined ? 0 : num1(a[i]))); const bad = v.find((x) => x instanceof FErr); if (bad) return bad as FErr; const [r, n, pv, fv, t] = v as number[]; return pmt(r!, n!, pv!, fv, t) })
def('FV', (a) => { const v = [0, 1, 2, 3, 4].map((i) => (a[i] === undefined ? 0 : num1(a[i]))); const bad = v.find((x) => x instanceof FErr); if (bad) return bad as FErr; const [r, n, pmt_, pv, t] = v as number[]; if (r === 0) return -(pv! + pmt_! * n!); const p = Math.pow(1 + r!, n!); return -(pv! * p + pmt_! * (1 + r! * t!) * ((p - 1) / r!)) })
def('PV', (a) => { const v = [0, 1, 2, 3, 4].map((i) => (a[i] === undefined ? 0 : num1(a[i]))); const bad = v.find((x) => x instanceof FErr); if (bad) return bad as FErr; const [r, n, pmt_, fv, t] = v as number[]; if (r === 0) return -(fv! + pmt_! * n!); const p = Math.pow(1 + r!, n!); return -(fv! + pmt_! * (1 + r! * t!) * ((p - 1) / r!)) / p })
def('NPV', (a) => { const r = num1(a[0]); if (r instanceof FErr) return r; const n = nums(a.slice(1)); if (n instanceof FErr) return n; return n.reduce((acc, x, i) => acc + x / Math.pow(1 + r, i + 1), 0) })

const ALIAS: Record<string, string> = {
  SOMME: 'SUM', MOYENNE: 'AVERAGE', SI: 'IF', SIERREUR: 'IFERROR', SI_ERREUR: 'IFERROR', SI_NON_DISP: 'IFNA', SIPLUSIEURS: 'IFS', SI_CONDITIONS: 'IFS', ET: 'AND', OU: 'OR', NON: 'NOT', OUX: 'XOR',
  NB: 'COUNT', NBVAL: 'COUNTA', 'NB.VIDE': 'COUNTBLANK', ARRONDI: 'ROUND', 'ARRONDI.SUP': 'ROUNDUP', 'ARRONDI.INF': 'ROUNDDOWN', TRONQUE: 'TRUNC', ENT: 'INT', PUISSANCE: 'POWER', RACINE: 'SQRT',
  PRODUIT: 'PRODUCT', 'SOMME.SI': 'SUMIF', 'SOMME.SI.ENS': 'SUMIFS', 'NB.SI': 'COUNTIF', 'NB.SI.ENS': 'COUNTIFS', 'MOYENNE.SI': 'AVERAGEIF', 'MOYENNE.SI.ENS': 'AVERAGEIFS', SOMMEPROD: 'SUMPRODUCT',
  MEDIANE: 'MEDIAN', ECARTYPE: 'STDEV', 'ECARTYPE.PEARSON': 'STDEVP', 'GRANDE.VALEUR': 'LARGE', 'PETITE.VALEUR': 'SMALL', RANG: 'RANK', CONCATENER: 'CONCATENATE', JOINDRE: 'TEXTJOIN', 'JOINDRE.TEXTE': 'TEXTJOIN',
  GAUCHE: 'LEFT', DROITE: 'RIGHT', STXT: 'MID', NBCAR: 'LEN', MAJUSCULE: 'UPPER', MINUSCULE: 'LOWER', NOMPROPRE: 'PROPER', SUPPRESPACE: 'TRIM', EPURAGE: 'CLEAN', SUBSTITUE: 'SUBSTITUTE', REMPLACER: 'REPLACE',
  TROUVE: 'FIND', CHERCHE: 'SEARCH', REPT: 'REPT', TEXTE: 'TEXT', CNUM: 'VALUE', CAR: 'CHAR', CODE_: 'CODE', RECHERCHEV: 'VLOOKUP', RECHERCHEH: 'HLOOKUP', RECHERCHEX: 'XLOOKUP', RECHERCHE: 'LOOKUP', EQUIV: 'MATCH',
  CHOISIR: 'CHOOSE', LIGNE: 'ROW', COLONNE: 'COLUMN', LIGNES: 'ROWS', COLONNES: 'COLUMNS', AUJOURDHUI: 'TODAY', MAINTENANT: 'NOW', ANNEE: 'YEAR', MOIS: 'MONTH', JOUR: 'DAY', HEURE: 'HOUR', SECONDE: 'SECOND', JOURSEM: 'WEEKDAY',
  JOURS: 'DAYS', ESTVIDE: 'ISBLANK', ESTNUM: 'ISNUMBER', ESTTEXTE: 'ISTEXT', ESTERREUR: 'ISERROR', ESTNA: 'ISNA', ESTPAIR: 'ISEVEN', ESTIMPAIR: 'ISODD', ALEA: 'RAND', 'ALEA.ENTRE.BORNES': 'RANDBETWEEN',
  SIGNE: 'SIGN', PLAFOND: 'CEILING', PLANCHER: 'FLOOR', VPM: 'PMT', VC: 'FV', VA: 'PV', PGCD: 'GCD', PPCM: 'LCM', FACT_: 'FACT', LOG_: 'LOG', DECALER: 'OFFSET', 'MOD_': 'MOD', 'ABS_': 'ABS', 'MIN_': 'MIN',
  FIN_MOIS: 'EOMONTH', MOIS_DECALER: 'EDATE', DATEDIF_: 'DATEDIF', EXP_: 'EXP', 'LN_': 'LN', PI_: 'PI', DEGRES: 'DEGREES', 'IMPAIR': 'ODD', 'PAIR': 'EVEN', QUOTIENT_: 'QUOTIENT', NA_: 'NA', INDEX_: 'INDEX',
}

export const FUNCTION_NAMES = Object.keys(FUNCS).sort()

// ── Reference rewriting (copy/paste, fill, insert/delete rows & columns) ─────

const REF_SCAN = /"(?:[^"]|"")*"|(?<![A-Za-z0-9_.$'!])((?:(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?)(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?::(\$?)([A-Za-z]{1,3})(\$?)(\d+))?(?![\w(])/g

export interface RefPart { sheet?: string; r: number; c: number; absR: boolean; absC: boolean }

/** Rewrites every cell reference of a formula. `fn` receives each endpoint, returns a new endpoint or null (-> #REF!). */
export function rewriteRefs(f: string, fn: (p: RefPart, isEnd: boolean, isRange: boolean) => RefPart | null): string {
  if (f[0] !== '=') return f
  return f.replace(REF_SCAN, (m, sheetPre: string, ac1: string, cl1: string, ar1: string, rw1: string, ac2?: string, cl2?: string, ar2?: string, rw2?: string) => {
    if (m[0] === '"') return m
    const sheet = sheetPre ? unquote(sheetPre.slice(0, -1)) : undefined
    const isRange = cl2 !== undefined
    const a = fn({ sheet, r: parseInt(rw1, 10) - 1, c: colIndex(cl1), absR: ar1 === '$', absC: ac1 === '$' }, false, isRange)
    const b = isRange ? fn({ sheet, r: parseInt(rw2!, 10) - 1, c: colIndex(cl2!), absR: ar2 === '$', absC: ac2 === '$' }, true, true) : a
    if (!a || !b) return '#REF!'
    const fmt = (p: RefPart) => `${p.absC ? '$' : ''}${colName(p.c)}${p.absR ? '$' : ''}${p.r + 1}`
    return `${sheetPre}${fmt(a)}${isRange ? ':' + fmt(b) : ''}`
  })
}

/** Moves a formula by (dr, dc): relative references follow, absolute ones stay. */
export function shiftFormula(f: string, dr: number, dc: number): string {
  return rewriteRefs(f, (p) => {
    const r = p.absR ? p.r : p.r + dr, c = p.absC ? p.c : p.c + dc
    return r < 0 || c < 0 ? null : { ...p, r, c }
  })
}

/** Adjusts references of the whole workbook after rows/columns were inserted (count > 0) or deleted (count < 0) in `target`. */
export function adjustFormula(f: string, ownSheet: string, target: string, axis: 'row' | 'col', at: number, count: number): string {
  return rewriteRefs(f, (p, isEnd, isRange) => {
    if ((p.sheet ?? ownSheet).toLowerCase() !== target.toLowerCase()) return p
    const v = axis === 'row' ? p.r : p.c
    let nv: number
    if (count > 0) nv = v >= at ? v + count : v
    else {
      const n = -count
      if (v < at) nv = v
      else if (v >= at + n) nv = v - n
      else if (!isRange) return null
      else nv = isEnd ? at - 1 : at
    }
    if (nv < 0) return null
    return axis === 'row' ? { ...p, r: nv } : { ...p, c: nv }
  })
}

/** Quick check used by the UI: does the text start a formula */
export const isFormula = (s: string) => s.length > 1 && s[0] === '='

/** Converts localized function names typed by the user (SOMME, SI…) to the canonical English ones */
export function canonicalizeFormula(f: string): string {
  if (f[0] !== '=') return f
  let out = ''
  let i = 0
  while (i < f.length) {
    if (f[i] === '"') { const m = f.slice(i).match(/^"(?:[^"]|"")*"/); const len = m ? m[0].length : f.length - i; out += f.slice(i, i + len); i += len; continue }
    const m = f.slice(i).match(/^[A-Za-zÀ-ÿ_][\wÀ-ÿ.]*(?=\()/)
    if (m) { const up = m[0].toUpperCase(); out += ALIAS[up] ?? up; i += m[0].length; continue }
    out += f[i]; i++
  }
  return out
}
