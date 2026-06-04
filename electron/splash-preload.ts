import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('splashAPI', {
  onStage: (cb: (msg: string) => void) => {
    ipcRenderer.on('splash:stage', (_event, msg: string) => cb(msg))
  },
  onError: (cb: (msg: string) => void) => {
    ipcRenderer.on('splash:error', (_event, msg: string) => cb(msg))
  },
  retry: () => {
    ipcRenderer.send('splash:retry')
  },
})
