/**
 * The sandboxed bridge exposed by `electron/preload.ts` via `contextBridge.exposeInMainWorld`.
 *
 * The renderer never imports `fs` or `path` — every file read/write/delete crosses this bridge
 * as an IPC round trip to the main process, which validates the filename against an allowlist
 * and confines the resolved path to `app.getPath('userData')`. This interface is the full extent
 * of what a compromised renderer could invoke; keep it narrow.
 *
 * Declared here (rather than only in `electron/preload.ts`) so the persistence stores — which
 * live in `src/` and are unit-tested with a fake in-memory implementation, no Electron involved
 * — can depend on the type without importing anything from the `electron` package.
 */
export interface MindMazeBridge {
  loadActive(): Promise<string | null>
  saveActive(json: string): Promise<void>
  clearActive(): Promise<void>
  loadSaved(): Promise<string | null>
  saveSaved(json: string): Promise<void>
  clearSaved(): Promise<void>
  loadSettings(): Promise<string | null>
  saveSettings(json: string): Promise<void>
  loadCustomQuestions(): Promise<string | null>
  saveCustomQuestions(json: string): Promise<void>
}

declare global {
  interface Window {
    mindmaze: MindMazeBridge
  }
}

export {}
