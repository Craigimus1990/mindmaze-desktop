import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('mindmaze', {
  ping: () => 'pong',
})
