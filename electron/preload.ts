import { contextBridge, ipcRenderer } from 'electron'
import type { MindMazeBridge } from '@/types/window'

/**
 * The renderer's only path to disk. `contextIsolation`/`sandbox` in `electron/main.ts` mean the
 * renderer cannot `require('fs')` even if compromised — this bridge, and the main-process
 * filename allowlist behind `store:read`/`store:write`/`store:delete`, are the entire surface
 * area for file access. Keep this interface narrow: whatever it exposes, a compromised page can
 * call.
 */
const bridge: MindMazeBridge = {
  loadActive: () => ipcRenderer.invoke('store:read', 'game_state.json') as Promise<string | null>,
  saveActive: (json) => ipcRenderer.invoke('store:write', 'game_state.json', json) as Promise<void>,
  clearActive: () => ipcRenderer.invoke('store:delete', 'game_state.json') as Promise<void>,
  loadSaved: () => ipcRenderer.invoke('store:read', 'saved_game.json') as Promise<string | null>,
  saveSaved: (json) => ipcRenderer.invoke('store:write', 'saved_game.json', json) as Promise<void>,
  clearSaved: () => ipcRenderer.invoke('store:delete', 'saved_game.json') as Promise<void>,
  loadSettings: () => ipcRenderer.invoke('store:read', 'settings.json') as Promise<string | null>,
  saveSettings: (json) => ipcRenderer.invoke('store:write', 'settings.json', json) as Promise<void>,
  loadCustomQuestions: () =>
    ipcRenderer.invoke('store:read', 'custom_questions.json') as Promise<string | null>,
  saveCustomQuestions: (json) =>
    ipcRenderer.invoke('store:write', 'custom_questions.json', json) as Promise<void>,
}

contextBridge.exposeInMainWorld('mindmaze', bridge)
