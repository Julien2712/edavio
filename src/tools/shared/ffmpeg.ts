import type { FFmpeg } from '@ffmpeg/ffmpeg'
import coreUrl from '@ffmpeg/core?url'
import wasmUrl from '@ffmpeg/core/wasm?url'

let inst: Promise<FFmpeg> | null = null

/** ffmpeg compiled to WebAssembly, loaded once and run entirely on this computer. */
export function getFfmpeg(): Promise<FFmpeg> {
  inst ??= (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const ff = new FFmpeg()
    await ff.load({ coreURL: coreUrl, wasmURL: wasmUrl })
    return ff
  })().catch((e) => { inst = null; throw e })
  return inst
}

export async function runFfmpeg(file: File, outExt: string, args: string[], onProgress?: (r: number) => void): Promise<Blob> {
  const ff = await getFfmpeg()
  const inName = 'in.' + (file.name.split('.').pop() || 'bin').toLowerCase()
  const outName = 'out.' + outExt
  const handler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(0.99, progress)))
  ff.on('progress', handler)
  try {
    await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()))
    const code = await ff.exec(['-i', inName, ...args, outName])
    if (code !== 0) throw new Error('ffmpeg ' + code)
    const data = (await ff.readFile(outName)) as Uint8Array
    onProgress?.(1)
    return new Blob([data as BlobPart], { type: outExt === 'mp3' ? 'audio/mpeg' : outExt === 'gif' ? 'image/gif' : outExt === 'mp4' ? 'video/mp4' : 'application/octet-stream' })
  } finally {
    ff.off('progress', handler)
    await ff.deleteFile(inName).catch(() => {})
    await ff.deleteFile(outName).catch(() => {})
  }
}
