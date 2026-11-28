import { app, dialog, ipcMain, net, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const binDir = () => path.join(app.getPath('userData'), 'bin')
const ownBinary = () => path.join(binDir(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
const ASSET = process.platform === 'win32' ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp'
const jobs = new Map()

function run(bin, args) {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn(bin, args, { windowsHide: true })
    p.stdout.on('data', (d) => (out += d))
    p.on('error', () => resolve(null))
    p.on('close', (code) => resolve(code === 0 ? out.trim() : null))
  })
}

/** yt-dlp from the PATH if present, otherwise the copy Edavio downloaded itself. */
async function locate() {
  const own = ownBinary()
  if (fs.existsSync(own)) { const v = await run(own, ['--version']); if (v) return { bin: own, version: v } }
  const v = await run('yt-dlp', ['--version'])
  return v ? { bin: 'yt-dlp', version: v } : null
}

export function registerYtDlp(getWindow) {
  const trusted = (e) => e.sender === getWindow()?.webContents

  ipcMain.handle('ytdlp:status', async (e) => {
    if (!trusted(e)) return null
    const f = await locate()
    return { available: !!f, version: f?.version ?? null, downloads: app.getPath('downloads') }
  })

  // Official release binary from github.com/yt-dlp/yt-dlp (also used to update it).
  ipcMain.handle('ytdlp:install', async (e) => {
    if (!trusted(e)) return { ok: false }
    try {
      const res = await net.fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ASSET}`)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      fs.mkdirSync(binDir(), { recursive: true })
      const tmp = ownBinary() + '.part'
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
      if (process.platform !== 'win32') fs.chmodSync(tmp, 0o755)
      fs.renameSync(tmp, ownBinary())
      return { ok: true, version: (await run(ownBinary(), ['--version'])) ?? '' }
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })

  ipcMain.handle('ytdlp:chooseDir', async (e) => {
    if (!trusted(e)) return null
    const r = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory', 'createDirectory'], defaultPath: app.getPath('downloads') })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('ytdlp:reveal', (e, file) => { if (trusted(e) && typeof file === 'string') shell.showItemInFolder(file) })

  ipcMain.handle('ytdlp:cancel', (e, id) => { if (trusted(e)) jobs.get(id)?.kill() })

  ipcMain.handle('ytdlp:download', async (e, opts) => {
    if (!trusted(e)) return { ok: false }
    const { id, url, mode, height, dir } = opts ?? {}
    let parsed
    try { parsed = new URL(url) } catch { return { ok: false, error: 'url' } }
    if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: 'url' }
    const found = await locate()
    if (!found) return { ok: false, error: 'missing' }
    const target = typeof dir === 'string' && fs.existsSync(dir) ? dir : app.getPath('downloads')
    const h = Number.isFinite(+height) && +height > 0 ? Math.round(+height) : 0
    const fmt = mode === 'audio' ? 'bestaudio[ext=m4a]/bestaudio' : h ? `best[height<=${h}][ext=mp4]/best[height<=${h}]/best` : 'best[ext=mp4]/best'
    const args = ['--newline', '--no-playlist', '--no-warnings', '--progress-template', 'download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
      '-f', fmt, '-P', target, '-o', '%(title).150B.%(ext)s', '--print', 'after_move:filepath', '--', parsed.toString()]
    const send = (data) => getWindow()?.webContents.send('ytdlp:progress', { id, ...data })
    return await new Promise((resolve) => {
      const p = spawn(found.bin, args, { windowsHide: true })
      jobs.set(id, p)
      let file = '', err = ''
      p.stdout.on('data', (d) => {
        for (const line of String(d).split(/\r?\n/)) {
          if (line.startsWith('download:')) { const [pct, speed, eta] = line.slice(9).split('|'); send({ percent: parseFloat(pct) || 0, speed: speed?.trim(), eta: eta?.trim() }) }
          else if (line.trim()) file = line.trim()
        }
      })
      p.stderr.on('data', (d) => (err += d))
      p.on('error', () => { jobs.delete(id); resolve({ ok: false, error: 'spawn' }) })
      p.on('close', (code, sig) => { jobs.delete(id); resolve(code === 0 && file ? { ok: true, file } : { ok: false, error: sig ? 'cancelled' : err.split('\n').filter(Boolean).pop() ?? 'failed' }) })
    })
  })
}
