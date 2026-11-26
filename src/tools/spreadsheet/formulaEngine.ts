export interface CellStyle {
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  color?: string
  bg?: string
}

export interface SheetData {
  id: string
  name: string
  rows: number
  cols: number
  /** Keyed by "r,c" (0-indexed) */
  cells: Record<string, string>
  styles: Record<string, CellStyle>
}

export function colIndexToLetter(col: number): string {
  let s = ''
  let n = col
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

export function cellCoordToRef(r: number, c: number): string {
  return `${colIndexToLetter(c)}${r + 1}`
}

export function refToCellCoord(ref: string): { r: number; c: number } | null {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!m || !m[1] || !m[2]) return null
  const letters = m[1]
  const row = parseInt(m[2], 10) - 1
  let col = 0
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }
  col -= 1
  if (row < 0 || col < 0) return null
  return { r: row, c: col }
}

function expandRange(a: string, b: string): { r: number; c: number }[] {
  const start = refToCellCoord(a)
  const end = refToCellCoord(b)
  if (!start || !end) return []
  const r1 = Math.min(start.r, end.r)
  const r2 = Math.max(start.r, end.r)
  const c1 = Math.min(start.c, end.c)
  const c2 = Math.max(start.c, end.c)
  const coords: { r: number; c: number }[] = []
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      coords.push({ r, c })
    }
  }
  return coords
}

/** Evaluates a spreadsheet cell value safely (supports =SUM/SOMME, AVERAGE/MOYENNE, MIN, MAX, COUNT/NB, IF/SI, arithmetic). */
export function evaluateCell(
  r: number,
  c: number,
  cells: Record<string, string>,
  visited: Set<string> = new Set(),
): string {
  const key = `${r},${c}`
  const raw = cells[key] ?? ''
  if (!raw.startsWith('=')) return raw
  if (visited.has(key)) return '#CYCLE!'
  visited.add(key)

  try {
    const expr = raw.slice(1).trim()
    const result = evalExpression(expr, cells, visited)
    if (typeof result === 'number') {
      if (!Number.isFinite(result)) return '#DIV/0!'
      return Number.isInteger(result) ? String(result) : String(Math.round(result * 10000) / 10000)
    }
    return String(result)
  } catch {
    return '#ERR!'
  } finally {
    visited.delete(key)
  }
}

function getNumericValues(
  arg: string,
  cells: Record<string, string>,
  visited: Set<string>,
): number[] {
  const parts = arg.split(',').map((s) => s.trim()).filter(Boolean)
  const nums: number[] = []
  for (const part of parts) {
    const rangeMatch = part.match(/^([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)$/)
    if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
      for (const coord of expandRange(rangeMatch[1], rangeMatch[2])) {
        const val = evaluateCell(coord.r, coord.c, cells, visited)
        const n = Number(val)
        if (val !== '' && !Number.isNaN(n)) nums.push(n)
      }
      continue
    }
    const val = evalExpression(part, cells, visited)
    const n = Number(val)
    if (val !== '' && !Number.isNaN(n)) nums.push(n)
  }
  return nums
}

function splitTopLevelArgs(argsStr: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ''
  let inQuotes = false
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i]!
    if (ch === '"') inQuotes = !inQuotes
    if (!inQuotes) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if ((ch === ',' || ch === ';') && depth === 0) {
        args.push(current.trim())
        current = ''
        continue
      }
    }
    current += ch
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function evalExpression(
  expr: string,
  cells: Record<string, string>,
  visited: Set<string>,
): number | string {
  // Replace function calls iteratively from innermost/outermost
  let processed = expr.trim()

  // Handle quoted string literal
  if (/^"[^"]*"$/.test(processed)) {
    return processed.slice(1, -1)
  }

  // Evaluate functions like SUM(...), SOMME(...), AVERAGE(...), MOYENNE(...), MIN(...), MAX(...), COUNT(...), NB(...), IF(...), SI(...)
  const fnRegex = /\b(SUM|SOMME|AVERAGE|MOYENNE|AVG|MIN|MAX|COUNT|NB|IF|SI|ROUND|ARRONDI)\s*\(/i
  let safety = 0
  while (fnRegex.test(processed) && safety++ < 25) {
    const match = fnRegex.exec(processed)
    if (!match || match.index === undefined) break
    const fnName = (match[1] ?? '').toUpperCase()
    const openIdx = match.index + match[0].length - 1
    let depth = 0
    let closeIdx = -1
    let inQ = false
    for (let i = openIdx; i < processed.length; i++) {
      const ch = processed[i]!
      if (ch === '"') inQ = !inQ
      if (!inQ) {
        if (ch === '(') depth++
        else if (ch === ')') {
          depth--
          if (depth === 0) {
            closeIdx = i
            break
          }
        }
      }
    }
    if (closeIdx === -1) throw new Error('Unclosed paren')

    const inner = processed.slice(openIdx + 1, closeIdx)
    let replacement: string

    if (fnName === 'IF' || fnName === 'SI') {
      const args = splitTopLevelArgs(inner)
      const cond = evalCondition(args[0] ?? '', cells, visited)
      const branch = cond ? (args[1] ?? '') : (args[2] ?? '')
      const val = evalExpression(branch, cells, visited)
      replacement = typeof val === 'number' ? String(val) : `"${val}"`
    } else if (fnName === 'ROUND' || fnName === 'ARRONDI') {
      const args = splitTopLevelArgs(inner)
      const num = Number(evalExpression(args[0] ?? '0', cells, visited))
      const digits = Number(evalExpression(args[1] ?? '0', cells, visited))
      const factor = Math.pow(10, digits)
      replacement = String(Math.round(num * factor) / factor)
    } else {
      const nums = getNumericValues(inner.replace(/;/g, ','), cells, visited)
      let res = 0
      if (fnName === 'SUM' || fnName === 'SOMME') {
        res = nums.reduce((a, b) => a + b, 0)
      } else if (fnName === 'AVERAGE' || fnName === 'MOYENNE' || fnName === 'AVG') {
        res = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
      } else if (fnName === 'MIN') {
        res = nums.length > 0 ? Math.min(...nums) : 0
      } else if (fnName === 'MAX') {
        res = nums.length > 0 ? Math.max(...nums) : 0
      } else if (fnName === 'COUNT' || fnName === 'NB') {
        res = nums.length
      }
      replacement = String(res)
    }

    processed = processed.slice(0, match.index) + replacement + processed.slice(closeIdx + 1)
  }

  if (/^"[^"]*"$/.test(processed.trim())) {
    return processed.trim().slice(1, -1)
  }

  // Replace cell references like A1, B12
  const withRefs = processed.replace(/\b([A-Za-z]+\d+)\b/g, (ref) => {
    const coord = refToCellCoord(ref)
    if (!coord) return '0'
    const v = evaluateCell(coord.r, coord.c, cells, visited)
    if (v === '') return '0'
    const n = Number(v)
    return Number.isNaN(n) ? `"${v.replace(/"/g, '')}"` : String(n)
  })

  // If the entire expression is now a single quoted string
  if (/^"[^"]*"$/.test(withRefs.trim())) {
    return withRefs.trim().slice(1, -1)
  }

  return parseArithmetic(withRefs)
}

function evalCondition(
  condStr: string,
  cells: Record<string, string>,
  visited: Set<string>,
): boolean {
  const ops = ['>=', '<=', '<>', '!=', '=', '>', '<']
  for (const op of ops) {
    const idx = condStr.indexOf(op)
    if (idx !== -1) {
      const left = evalExpression(condStr.slice(0, idx), cells, visited)
      const right = evalExpression(condStr.slice(idx + op.length), cells, visited)
      switch (op) {
        case '>=':
          return Number(left) >= Number(right)
        case '<=':
          return Number(left) <= Number(right)
        case '<>':
        case '!=':
          return String(left) !== String(right)
        case '=':
          return String(left) === String(right)
        case '>':
          return Number(left) > Number(right)
        case '<':
          return Number(left) < Number(right)
      }
    }
  }
  return Boolean(evalExpression(condStr, cells, visited))
}

/** Recursive-descent arithmetic parser (+, -, *, /, parentheses, unary +/-). */
function parseArithmetic(input: string): number {
  let pos = 0
  const s = input.replace(/\s+/g, '')

  function parseExpr(): number {
    let left = parseTerm()
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++]
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function parseTerm(): number {
    let left = parseFactor()
    while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
      const op = s[pos++]
      const right = parseFactor()
      left = op === '*' ? left * right : left / right
    }
    return left
  }

  function parseFactor(): number {
    if (s[pos] === '+') {
      pos++
      return parseFactor()
    }
    if (s[pos] === '-') {
      pos++
      return -parseFactor()
    }
    if (s[pos] === '(') {
      pos++
      const val = parseExpr()
      if (s[pos] === ')') pos++
      return val
    }
    const start = pos
    while (pos < s.length && /[0-9.]/.test(s[pos]!)) {
      pos++
    }
    if (pos === start) throw new Error('Unexpected token')
    return Number(s.slice(start, pos))
  }

  const result = parseExpr()
  if (pos < s.length) throw new Error('Trailing characters')
  return result
}
