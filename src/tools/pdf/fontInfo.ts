import type { FontFamily } from './types'
import { fontStack } from '@/lib/systemFonts'

export interface FontClass {
  family: FontFamily
  bold: boolean
  italic: boolean
  /** true when the real font name was recognised (so bold/italic are reliable) */
  known: boolean
}

const MONO_RE =
  /courier|mono|consolas|cmtt|lmmono|typewriter|menlo|inconsolata|source ?code|lucida ?console|cousine/i
const SANS_RE =
  /sans|arial|helvet|calibri|verdana|tahoma|segoe|roboto|cmss|lmsans|inter\b|trebuchet|gothic|univers|frutiger|myriad|arimo|futura|avenir|lato|montserrat|nunito|poppins|ubuntu/i
const SERIF_RE =
  /times|nimbusrom|nimbus ?roman|lmroman|lmr\d|cmr\d|cmbx|cmti|cmsl|cmcsc|cmu ?serif|georgia|garamond|palatino|minion|cambria|bookman|century|charter|utopia|termes|tinos|serif|stix|baskerville|caslon|didot|constantia|sabon|antiqua|libertine|computer ?modern|latin ?modern/i

const BOLD_RE =
  /bold|black|heavy|semibold|demi|extrabold|cmbx|cmb10|cmssbx|[-,]bd\b|[-,]b$|-medi$|-semi\b/i
const ITALIC_RE = /italic|oblique|cmti|cmsl|cmssi|slant|kursiv|[-,]it$|[-,]i$|ital$|-ital/i

/**
 * Work out family / bold / italic from the real PostScript font name
 * (e.g. "ABCDEF+NimbusRomNo9L-Medi" => serif, bold).
 * `hints` come from pdf.js flags and are only used when the name says nothing.
 */
export function classifyFont(
  rawName: string | undefined,
  hints: { styleFamily?: string; isMono?: boolean; isSerif?: boolean },
): FontClass {
  const name = (rawName ?? '').replace(/^[A-Z]{6}\+/, '').trim()
  const informative = name !== '' && !/^type\s?3$/i.test(name) && !/^g_d\d+_f\d+$/i.test(name)

  let family: FontFamily | null = null
  if (informative) {
    if (MONO_RE.test(name)) family = 'Courier'
    else if (SANS_RE.test(name)) family = 'Helvetica'
    else if (SERIF_RE.test(name)) family = 'TimesRoman'
  }
  const known = family !== null

  if (family === null) {
    const sf = hints.styleFamily ?? ''
    if (hints.isMono || /mono|courier/i.test(sf)) family = 'Courier'
    else if (hints.isSerif || /^serif$|times/i.test(sf)) family = 'TimesRoman'
    else family = 'Helvetica'
  }

  return {
    family,
    bold: informative && BOLD_RE.test(name),
    italic: informative && ITALIC_RE.test(name),
    known,
  }
}

// ── CSS stacks ────────────────────────────────────────────────────────────────
// These fonts are metric-compatible with the PDF standard fonts used on export
// (Helvetica / Times-Roman / Courier), so the preview and the exported PDF match.

export function fontCss(family: FontFamily): string {
  if (family === 'TimesRoman') {
    return '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", Tinos, serif'
  }
  if (family === 'Courier') {
    return '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", Cousine, monospace'
  }
  if (family !== 'Helvetica') return fontStack(family)
  return 'Arial, Helvetica, "Liberation Sans", "Nimbus Sans", Arimo, sans-serif'
}

const FALLBACK_METRICS: Record<string, { ascent: number; descent: number }> = {
  TimesRoman: { ascent: 0.891, descent: 0.216 },
  Helvetica: { ascent: 0.905, descent: 0.212 },
  Courier: { ascent: 0.833, descent: 0.3 },
}

let sharedCtx: CanvasRenderingContext2D | null | undefined
function getCtx(): CanvasRenderingContext2D | null {
  if (sharedCtx !== undefined) return sharedCtx
  try {
    sharedCtx = document.createElement('canvas').getContext('2d')
  } catch {
    sharedCtx = null
  }
  return sharedCtx
}

const metricsCache = new Map<FontFamily, { ascent: number; descent: number }>()

/** Ascent / descent of the font actually used by the browser, in em. */
export function getFontMetrics(family: FontFamily): { ascent: number; descent: number } {
  const cached = metricsCache.get(family)
  if (cached) return cached
  let result = FALLBACK_METRICS[family] ?? FALLBACK_METRICS.Helvetica!
  const ctx = getCtx()
  if (ctx) {
    ctx.font = `100px ${fontCss(family)}`
    const m = ctx.measureText('Hxg')
    if (m.fontBoundingBoxAscent > 0 && m.fontBoundingBoxDescent > 0) {
      result = { ascent: m.fontBoundingBoxAscent / 100, descent: m.fontBoundingBoxDescent / 100 }
    }
  }
  metricsCache.set(family, result)
  return result
}

export function lineHeightFactor(compact: boolean | undefined): number {
  return compact ? 1.15 : 1.25
}

export function textPadding(compact: boolean | undefined): number {
  return compact ? 0 : 4
}

/**
 * Distance from the top of a text box to the baseline of its first line, in px at
 * scale 1. Used for both the on-screen box and the PDF export so they line up.
 */
export function baselineFromTop(
  family: FontFamily,
  fontSize: number,
  compact: boolean | undefined,
): number {
  const { ascent, descent } = getFontMetrics(family)
  const lh = lineHeightFactor(compact) * fontSize
  return textPadding(compact) + (lh - (ascent + descent) * fontSize) / 2 + ascent * fontSize
}

export function measureTextWidth(
  text: string,
  family: FontFamily,
  bold: boolean,
  italic: boolean,
  fontSize: number,
  letterSpacing = 0,
): number {
  const ctx = getCtx()
  if (!ctx) return text.length * fontSize * 0.5 + letterSpacing * text.length
  ctx.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${fontSize}px ${fontCss(family)}`
  return ctx.measureText(text).width + letterSpacing * text.length
}

/**
 * Letter spacing (px) that makes `text` in the substitute font exactly as wide as the
 * original line. Returns 0 when the difference is too large to be a plain font swap.
 */
export function fitLetterSpacing(
  text: string,
  family: FontFamily,
  bold: boolean,
  italic: boolean,
  fontSize: number,
  targetWidth: number,
): number {
  if (text.length < 2 || targetWidth <= 0) return 0
  const natural = measureTextWidth(text, family, bold, italic, fontSize)
  const ls = (targetWidth - natural) / text.length
  if (Math.abs(ls) < 0.02 || Math.abs(ls) > fontSize * 0.12) return 0
  return Math.round(ls * 100) / 100
}
