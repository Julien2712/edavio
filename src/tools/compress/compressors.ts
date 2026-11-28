import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib'
import JSZip from 'jszip'

export type Level = 'light' | 'balanced' | 'max'

/** JPEG quality and maximum long side (px) of an embedded image, per level. */
const PROFILE: Record<Level, { quality: number; maxPx: number }> = {
  light: { quality: 0.86, maxPx: 3200 },
  balanced: { quality: 0.74, maxPx: 2000 },
  max: { quality: 0.58, maxPx: 1400 },
}

export interface CompressResult {
  blob: Blob
  name: string
  before: number
  after: number
  /** the output is the original because no gain was possible */
  unchanged: boolean
}

type Progress = (ratio: number) => void

const canvasToBlob = (c: HTMLCanvasElement | OffscreenCanvas, type: string, q?: number): Promise<Blob> =>
  'convertToBlob' in c ? c.convertToBlob({ type, quality: q }) : new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('encode'))), type, q))

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Re-encode a decoded bitmap as JPEG/PNG/WebP at a reduced size. */
async function reencode(bmp: ImageBitmap, type: 'image/jpeg' | 'image/png' | 'image/webp', level: Level): Promise<{ blob: Blob; w: number; h: number }> {
  const { quality, maxPx } = PROFILE[level]
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
  const c = makeCanvas(w, h)
  const g = c.getContext('2d')!
  if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h) }
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, 0, 0, w, h)
  return { blob: await canvasToBlob(c, type, quality), w, h }
}

// ── PDF ───────────────────────────────────────────────────────────────────────

const nameOf = (v: unknown) => (v instanceof PDFName ? v.decodeText() : undefined)
const numOf = (v: unknown) => (v instanceof PDFNumber ? v.asNumber() : undefined)

function filtersOf(dict: PDFDict): string[] {
  const f = dict.lookup(PDFName.of('Filter'))
  if (f instanceof PDFName) return [f.decodeText()]
  if (f instanceof PDFArray) return f.asArray().map((x) => nameOf(x) ?? '')
  return []
}

export async function compressPdf(file: File, level: Level, stripMeta: boolean, onProgress?: Progress): Promise<CompressResult> {
  const before = file.size
  const bytes = new Uint8Array(await file.arrayBuffer())
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const ctx = doc.context
  const images: [PDFRef, PDFRawStream][] = []
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && nameOf(obj.dict.lookup(PDFName.of('Subtype'))) === 'Image') images.push([ref, obj])
  }
  let done = 0
  for (const [ref, st] of images) {
    done++
    onProgress?.(done / Math.max(1, images.length) * 0.9)
    try {
      const d = st.dict
      if (d.lookup(PDFName.of('ImageMask')) || d.has(PDFName.of('Mask'))) continue
      const w = numOf(d.lookup(PDFName.of('Width'))), h = numOf(d.lookup(PDFName.of('Height')))
      if (!w || !h) continue
      const raw = st.getContents()
      if (raw.length < 40_000) continue // tiny images: nothing to gain
      const filters = filtersOf(d)
      let bmp: ImageBitmap | null = null
      let cs: 'DeviceRGB' | 'DeviceGray' = 'DeviceRGB'
      if (filters.length === 1 && filters[0] === 'DCTDecode') {
        bmp = await createImageBitmap(new Blob([raw as BlobPart], { type: 'image/jpeg' }))
        const c0 = d.lookup(PDFName.of('ColorSpace'))
        cs = nameOf(c0) === 'DeviceGray' ? 'DeviceGray' : 'DeviceRGB'
      } else if (filters.length <= 1 && (filters[0] === undefined || filters[0] === 'FlateDecode')) {
        if (numOf(d.lookup(PDFName.of('BitsPerComponent'))) !== 8) continue
        const c0 = d.lookup(PDFName.of('ColorSpace'))
        const csName = nameOf(c0)
        if (csName !== 'DeviceRGB' && csName !== 'DeviceGray') continue
        if (d.has(PDFName.of('DecodeParms')) && filters[0] === 'FlateDecode') {
          const dp = d.lookup(PDFName.of('DecodeParms'))
          if (dp instanceof PDFDict && (numOf(dp.lookup(PDFName.of('Predictor'))) ?? 1) > 1) {
            // PNG predictors are undone by decodePDFRawStream
          }
        }
        const pixels = filters[0] === 'FlateDecode' ? (decodePDFRawStream(st).decode() as Uint8Array) : raw
        const n = csName === 'DeviceRGB' ? 3 : 1
        if (pixels.length < w * h * n) continue
        const rgba = new Uint8ClampedArray(w * h * 4)
        for (let i = 0, p = 0; i < w * h; i++, p += 4) {
          if (n === 3) { rgba[p] = pixels[i * 3]!; rgba[p + 1] = pixels[i * 3 + 1]!; rgba[p + 2] = pixels[i * 3 + 2]! }
          else { rgba[p] = rgba[p + 1] = rgba[p + 2] = pixels[i]! }
          rgba[p + 3] = 255
        }
        bmp = await createImageBitmap(new ImageData(rgba, w, h))
        cs = csName
      }
      if (!bmp) continue
      const out = await reencode(bmp, 'image/jpeg', level)
      bmp.close()
      const data = new Uint8Array(await out.blob.arrayBuffer())
      if (data.length >= raw.length * 0.92) continue
      const nd = ctx.obj({
        Type: 'XObject', Subtype: 'Image', Width: out.w, Height: out.h, ColorSpace: cs === 'DeviceGray' ? 'DeviceRGB' : cs,
        BitsPerComponent: 8, Filter: 'DCTDecode', Length: data.length,
      })
      const smask = d.get(PDFName.of('SMask'))
      if (smask) nd.set(PDFName.of('SMask'), smask)
      ctx.assign(ref, PDFRawStream.of(nd, data))
    } catch {
      // keep the original image when anything goes wrong
    }
  }
  if (stripMeta) {
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer(''); doc.setCreator('')
  }
  const saved = await doc.save({ useObjectStreams: true, updateFieldAppearances: false })
  onProgress?.(1)
  const unchanged = saved.length >= before
  return { blob: new Blob([(unchanged ? bytes : saved) as BlobPart], { type: 'application/pdf' }), name: file.name.replace(/\.pdf$/i, '') + '-compressed.pdf', before, after: unchanged ? before : saved.length, unchanged }
}

// ── Office / OpenDocument (zip with media) ────────────────────────────────────

export async function compressZipDocument(file: File, level: Level, onProgress?: Progress): Promise<CompressResult> {
  const before = file.size
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const names = Object.keys(zip.files).filter((n) => /(^|\/)(media|Pictures|embeddings)\/[^/]+\.(jpe?g|png)$/i.test(n) || /(^|\/)media\/[^/]+\.jpeg$/i.test(n))
  let i = 0
  for (const n of names) {
    i++
    onProgress?.((i / Math.max(1, names.length)) * 0.9)
    try {
      const entry = zip.files[n]!
      const buf = await entry.async('uint8array')
      if (buf.length < 40_000) continue
      const png = /\.png$/i.test(n)
      const bmp = await createImageBitmap(new Blob([buf as BlobPart], { type: png ? 'image/png' : 'image/jpeg' }))
      const out = await reencode(bmp, png ? 'image/png' : 'image/jpeg', level)
      bmp.close()
      const data = new Uint8Array(await out.blob.arrayBuffer())
      if (data.length < buf.length * 0.92) zip.file(n, data)
    } catch {
      // keep original
    }
  }
  const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 }, mimeType: file.type })
  onProgress?.(1)
  const unchanged = out.size >= before
  const ext = file.name.match(/\.[^.]+$/)?.[0] ?? ''
  return { blob: unchanged ? file : out, name: file.name.replace(/\.[^.]+$/, '') + '-compressed' + ext, before, after: unchanged ? before : out.size, unchanged }
}

// ── plain images ──────────────────────────────────────────────────────────────

export async function compressImage(file: File, level: Level): Promise<CompressResult> {
  const before = file.size
  const bmp = await createImageBitmap(file)
  const type = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const out = await reencode(bmp, type, level)
  bmp.close()
  const unchanged = out.blob.size >= before
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  return { blob: unchanged ? file : out.blob, name: file.name.replace(/\.[^.]+$/, '') + `-compressed.${ext}`, before, after: unchanged ? before : out.blob.size, unchanged }
}

export const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.odt,.ods,.odp,.jpg,.jpeg,.png,.webp'

export function compressFile(file: File, level: Level, stripMeta: boolean, onProgress?: Progress): Promise<CompressResult> {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) return compressPdf(file, level, stripMeta, onProgress)
  if (/\.(docx|pptx|xlsx|odt|ods|odp)$/.test(n)) return compressZipDocument(file, level, onProgress)
  if (/\.(jpe?g|png|webp)$/.test(n)) return compressImage(file, level)
  return Promise.reject(new Error('unsupported'))
}
