import { stripSuppressedShapesFromPdf } from './pdfShapes'
import { stripSuppressedTextFromPdf, type TextSuppression } from './pdfTextRemover'
import type { ShapeSuppression } from './types'

/** Anything removed from the original PDF content (text runs or vector shapes). */
export type Suppression = TextSuppression | ShapeSuppression

/**
 * Applies every suppression to the original PDF bytes.
 * `matchedIds` lists the text suppressions that were really found in the content streams.
 */
export async function applySuppressions(
  originalBytes: Uint8Array,
  suppressions: Suppression[],
): Promise<{ bytes: Uint8Array; matchedIds: Set<string> }> {
  const texts = suppressions.filter((s): s is TextSuppression => s.kind === 'text')
  const shapes = suppressions.filter((s): s is ShapeSuppression => s.kind === 'shape')

  const afterText = await stripSuppressedTextFromPdf(originalBytes, texts)
  const bytes = await stripSuppressedShapesFromPdf(afterText.bytes, shapes)
  return { bytes, matchedIds: afterText.matchedIds }
}
