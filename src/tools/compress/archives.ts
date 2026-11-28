import JSZip from 'jszip'
import type { Level } from './compressors'

export interface Entry { name: string; data: Uint8Array }

const enc = new TextEncoder()
const dec = new TextDecoder()

export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(s).arrayBuffer())
}
export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(s).arrayBuffer())
}

function octal(n: number, len: number) { return n.toString(8).padStart(len - 1, '0') + '\0' }

export function makeTar(entries: Entry[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const e of entries) {
    const h = new Uint8Array(512)
    const put = (s: string, off: number) => h.set(enc.encode(s).slice(0, 100), off)
    put(e.name.slice(0, 100), 0)
    put(octal(0o644, 8), 100); put(octal(0, 8), 108); put(octal(0, 8), 116)
    put(octal(e.data.length, 12), 124); put(octal(Math.floor(Date.now() / 1000), 12), 136)
    put('        ', 148) // checksum placeholder
    h[156] = 0x30
    put('ustar\0', 257); put('00', 263)
    let sum = 0
    for (const b of h) sum += b
    put(sum.toString(8).padStart(6, '0') + '\0 ', 148)
    parts.push(h, e.data, new Uint8Array((512 - (e.data.length % 512)) % 512))
  }
  parts.push(new Uint8Array(1024))
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export function parseTar(buf: Uint8Array): Entry[] {
  const out: Entry[] = []
  let o = 0
  while (o + 512 <= buf.length) {
    const h = buf.subarray(o, o + 512)
    if (h.every((b) => b === 0)) break
    const name = dec.decode(h.subarray(0, 100)).replace(/\0.*$/, '')
    const size = parseInt(dec.decode(h.subarray(124, 136)).replace(/\0.*$/, '').trim() || '0', 8)
    const type = String.fromCharCode(h[156] || 0x30)
    o += 512
    if ((type === '0' || type === '\0') && name) out.push({ name, data: buf.slice(o, o + size) })
    o += Math.ceil(size / 512) * 512
  }
  return out
}

const LEVEL: Record<Level, number> = { light: 3, balanced: 6, max: 9 }

export async function createArchive(files: File[], kind: 'zip' | 'tar.gz', level: Level): Promise<Blob> {
  const rel = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
  if (kind === 'zip') {
    const zip = new JSZip()
    for (const f of files) zip.file(rel(f), f)
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: LEVEL[level] } })
  }
  const entries: Entry[] = []
  for (const f of files) entries.push({ name: rel(f), data: new Uint8Array(await f.arrayBuffer()) })
  return new Blob([(await gzip(makeTar(entries))) as BlobPart], { type: 'application/gzip' })
}

export async function extractArchive(file: File): Promise<Entry[]> {
  const n = file.name.toLowerCase()
  const buf = new Uint8Array(await file.arrayBuffer())
  if (n.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(buf)
    const out: Entry[] = []
    for (const [name, e] of Object.entries(zip.files)) if (!e.dir) out.push({ name, data: await e.async('uint8array') })
    return out
  }
  if (n.endsWith('.tar')) return parseTar(buf)
  if (n.endsWith('.tar.gz') || n.endsWith('.tgz')) return parseTar(await gunzip(buf))
  if (n.endsWith('.gz')) return [{ name: file.name.replace(/\.gz$/i, ''), data: await gunzip(buf) }]
  throw new Error('unsupported')
}
