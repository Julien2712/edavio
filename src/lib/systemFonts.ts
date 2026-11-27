/** Access to the fonts installed on the computer (Chromium Local Font Access API, enabled in Electron). */

interface LocalFont {
  family: string
  fullName: string
  postscriptName: string
  style: string
  blob(): Promise<Blob>
}
type QueryFn = () => Promise<LocalFont[]>

export const BASE_FONTS = [
  'Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Helvetica', 'Impact', 'Segoe UI',
  'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
]

let fontsPromise: Promise<LocalFont[]> | null = null
let familiesCache: string[] | null = null

function query(): Promise<LocalFont[]> {
  fontsPromise ??= (async () => {
    const q = (window as unknown as { queryLocalFonts?: QueryFn }).queryLocalFonts
    if (!q) return []
    try {
      return await q.call(window)
    } catch {
      fontsPromise = null // permission / user-activation failure: allow a later retry
      return []
    }
  })()
  return fontsPromise
}

function probe(list: string[]): string[] {
  const c = document.createElement('canvas').getContext('2d')
  if (!c) return list
  const text = 'mmmmmmmmmmlliWW0123'
  const width = (f: string) => {
    c.font = `72px ${f}`
    return c.measureText(text).width
  }
  const ref = [width('monospace'), width('serif'), width('sans-serif')]
  return list.filter((f) => ['monospace', 'serif', 'sans-serif'].some((b, i) => width(`'${f}', ${b}`) !== ref[i]))
}

/** Sorted list of installed font families (falls back to a probed list of common fonts). */
export async function listFontFamilies(): Promise<string[]> {
  if (familiesCache) return familiesCache
  const fonts = await query()
  const set = new Set<string>(fonts.map((f) => f.family))
  const real = set.size > 0
  if (!real) probe(BASE_FONTS).forEach((f) => set.add(f))
  const list = [...set].sort((a, b) => a.localeCompare(b))
  if (real) familiesCache = list
  return list
}

/** Raw bytes of an installed font file for a family + style (for embedding in a PDF). */
export async function getFontBytes(family: string, bold: boolean, italic: boolean): Promise<Uint8Array | null> {
  const fonts = (await query()).filter((f) => f.family.toLowerCase() === family.toLowerCase())
  if (!fonts.length) return null
  const score = (f: LocalFont) => {
    const s = f.style.toLowerCase()
    return (/bold|black|heavy/.test(s) === bold ? 2 : 0) + (/italic|oblique/.test(s) === italic ? 2 : 0) + (/condensed|narrow|light|thin/.test(s) ? 0 : 1)
  }
  const best = fonts.sort((a, b) => score(b) - score(a))[0]!
  try {
    return new Uint8Array(await (await best.blob()).arrayBuffer())
  } catch {
    return null
  }
}

export const fontStack = (family: string) => `'${family.replace(/'/g, '')}', 'Segoe UI', Arial, sans-serif`
