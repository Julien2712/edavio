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

export type ImageFormat = 'auto' | 'jpeg' | 'webp' | 'png'
export interface ImageOptions {
  format: ImageFormat
  /** overrides the level's quality (0.3 – 1) */
  quality?: number
  /** overrides the level's maximum long side (px) */
  maxPx?: number
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch {
    // SVG and a few other formats need an <img>
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      const w = img.naturalWidth || 1024, h = img.naturalHeight || 1024
      const c = makeCanvas(w, h)
      c.getContext('2d')!.drawImage(img, 0, 0, w, h)
      return await createImageBitmap(c)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

export async function compressImage(file: File, level: Level, opts: ImageOptions = { format: 'auto' }): Promise<CompressResult> {
  const before = file.size
  const bmp = await decodeImage(file)
  const prof = PROFILE[level]
  const same = file.type === 'image/png' ? 'image/png' : file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
  const type = opts.format === 'auto' ? same : opts.format === 'jpeg' ? 'image/jpeg' : opts.format === 'png' ? 'image/png' : 'image/webp'
  const k = Math.min(1, (opts.maxPx ?? prof.maxPx) / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
  const c = makeCanvas(w, h)
  const g = c.getContext('2d')!
  if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h) }
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const blob = await canvasToBlob(c, type, opts.quality ?? prof.quality)
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  const converted = type !== same
  const unchanged = !converted && blob.size >= before
  return { blob: unchanged ? file : blob, name: file.name.replace(/\.[^.]+$/, '') + `-compressed.${ext}`, before, after: unchanged ? before : blob.size, unchanged }
}

// ── audio / video (re-encoded in the browser, plays in real time) ────────────

export interface MediaOptions { maxHeight?: number }
const VIDEO_PROFILE: Record<Level, { vbps: number; abps: number; maxH: number }> = {
  light: { vbps: 4_000_000, abps: 160_000, maxH: 1080 },
  balanced: { vbps: 1_800_000, abps: 112_000, maxH: 720 },
  max: { vbps: 800_000, abps: 64_000, maxH: 480 },
}

export async function compressMedia(file: File, level: Level, onProgress?: Progress, force = false): Promise<CompressResult> {
  const before = file.size
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name)
  const prof = VIDEO_PROFILE[level]
  const url = URL.createObjectURL(file)
  const el = document.createElement(isVideo ? 'video' : 'audio') as HTMLVideoElement
  el.src = url
  el.muted = false
  el.preload = 'auto'
  ;(el as HTMLVideoElement).playsInline = true
  try {
    await new Promise<void>((res, rej) => { el.onloadedmetadata = () => res(); el.onerror = () => rej(new Error('decode')) })
    const duration = Number.isFinite(el.duration) ? el.duration : 0
    const AC = new AudioContext()
    const src = AC.createMediaElementSource(el)
    const dest = AC.createMediaStreamDestination()
    src.connect(dest) // the user hears nothing: not connected to the speakers
    const tracks: MediaStreamTrack[] = [...dest.stream.getAudioTracks()]
    let canvas: HTMLCanvasElement | null = null
    let raf = 0
    if (isVideo) {
      const k = Math.min(1, prof.maxH / (el.videoHeight || prof.maxH))
      const w = Math.max(2, Math.round(((el.videoWidth || 640) * k) / 2) * 2), h = Math.max(2, Math.round(((el.videoHeight || 360) * k) / 2) * 2)
      canvas = makeCanvas(w, h)
      const g = canvas.getContext('2d')!
      const draw = () => { g.drawImage(el, 0, 0, w, h); raf = requestAnimationFrame(draw) }
      draw()
      tracks.unshift(...canvas.captureStream(30).getVideoTracks())
    }
    const mime = isVideo
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m))
    if (!mime) throw new Error('unsupported')
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: prof.vbps, audioBitsPerSecond: prof.abps })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const finished = new Promise<void>((res) => { rec.onstop = () => res() })
    rec.start(1000)
    await AC.resume()
    const tick = setInterval(() => { if (duration) onProgress?.(Math.min(0.98, el.currentTime / duration)) }, 400)
    await el.play()
    await new Promise<void>((res) => { el.onended = () => res() })
    clearInterval(tick)
    cancelAnimationFrame(raf)
    rec.stop()
    await finished
    void AC.close()
    const blob = new Blob(chunks, { type: mime.split(';')[0] })
    onProgress?.(1)
    const unchanged = !force && blob.size >= before
    return { blob: unchanged ? file : blob, name: file.name.replace(/\.[^.]+$/, '') + (force ? '.webm' : '-compressed.webm'), before, after: unchanged ? before : blob.size, unchanged }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const DOC_RE = /\.(pdf|docx|pptx|xlsx|odt|ods|odp|zip|epub)$/i
export const OFFICE_RE = /\.(docx|pptx|xlsx|odt|ods|odp|epub)$/i
export const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i
export const MEDIA_RE = /\.(mp4|mov|mkv|webm|m4v|avi|mp3|wav|ogg|aac|m4a|flac|opus)$/i

export function compressFile(file: File, level: Level, stripMeta: boolean, onProgress?: Progress): Promise<CompressResult> {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) return compressPdf(file, level, stripMeta, onProgress)
  if (/\.(docx|pptx|xlsx|odt|ods|odp|zip|epub)$/.test(n)) return compressZipDocument(file, level, onProgress)
  if (IMG_RE.test(n)) return compressImage(file, level)
  if (MEDIA_RE.test(n)) return compressMedia(file, level, onProgress)
  return Promise.reject(new Error('unsupported'))
}
