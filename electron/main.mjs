import { app, BrowserWindow, dialog, net, protocol, session, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_URL = 'http://127.0.0.1:5173'
const isDev = !app.isPackaged
const DIST = path.join(__dirname, '..', 'dist')

// Production build is served through app://edavio so WebAssembly/workers/fetch behave like on http.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Edavio',
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Unsaved work in an editor tab: ask before closing the window.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Rester', 'Quitter'],
      defaultId: 0,
      cancelId: 0,
      title: 'Edavio',
      message: 'Quitter Edavio ? / Quit Edavio?',
      detail: 'Des modifications non enregistrées seront perdues. / Unsaved changes will be lost.',
    })
    if (choice === 1) event.preventDefault()
  })

  win.once('ready-to-show', () => win.show())

  // External links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const internal = isDev ? url.startsWith(DEV_URL) : url.startsWith('app://')
    if (!internal) {
      event.preventDefault()
      if (url.startsWith('http')) void shell.openExternal(url)
    }
  })

  if (isDev) {
    void win.loadURL(DEV_URL)
  } else {
    void win.loadURL('app://edavio/index.html')
  }
}

// Single instance: reopening focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html'
      const file = path.normalize(path.join(DIST, rel))
      if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 })
      return net.fetch(pathToFileURL(file).toString())
    })
    // Lets the editors list the fonts installed on this computer (window.queryLocalFonts)
    const ses = session.defaultSession
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'local-fonts'))
    ses.setPermissionCheckHandler((_wc, permission) => permission === 'local-fonts')
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
