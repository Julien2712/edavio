// Sandboxed preload (CommonJS). Exposes only the video-download bridge.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('edavio', {
  ytdlp: {
    status: () => ipcRenderer.invoke('ytdlp:status'),
    install: () => ipcRenderer.invoke('ytdlp:install'),
    info: (url) => ipcRenderer.invoke('ytdlp:info', url),
    chooseDir: () => ipcRenderer.invoke('ytdlp:chooseDir'),
    download: (opts) => ipcRenderer.invoke('ytdlp:download', opts),
    cancel: (id) => ipcRenderer.invoke('ytdlp:cancel', id),
    reveal: (file) => ipcRenderer.invoke('ytdlp:reveal', file),
    onProgress: (cb) => {
      const fn = (_e, data) => cb(data)
      ipcRenderer.on('ytdlp:progress', fn)
      return () => ipcRenderer.removeListener('ytdlp:progress', fn)
    },
  },
})
