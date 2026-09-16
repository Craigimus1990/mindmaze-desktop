import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * The only filenames the renderer may read, write, or delete via the `store:*` IPC channels.
 *
 * This is what stops a compromised renderer — `contextIsolation`/`sandbox` deny it `fs` and
 * `path` directly, but the bridge itself is a raw string channel, so the allowlist plus the
 * userData-confinement check in `resolveStorePath` are the actual security boundary. Do not add
 * a filename here without also considering what a renderer that only wanted to read this file
 * could do with write/delete access to it too.
 */
const ALLOWED_FILES = new Set([
  'game_state.json',
  'saved_game.json',
  'settings.json',
  'custom_questions.json',
])

const resolveStorePath = (name: string): string => {
  if (!ALLOWED_FILES.has(name)) throw new Error(`Refusing to access ${name}`)
  const userDataDir = app.getPath('userData')
  const resolved = path.join(userDataDir, name)
  // Defence in depth: even though ALLOWED_FILES only contains bare filenames, confirm the
  // resolved path never escapes userData (e.g. via a name containing ".." that somehow got
  // this far) before touching disk.
  if (path.dirname(resolved) !== userDataDir) {
    throw new Error(`Refusing to access ${name}`)
  }
  return resolved
}

ipcMain.handle('store:read', async (_e, name: string): Promise<string | null> => {
  try {
    return await readFile(resolveStorePath(name), 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('store:write', async (_e, name: string, json: string): Promise<void> => {
  // A Buffer or TypedArray is structured-clone-transferable over ipcRenderer.invoke and would
  // otherwise pass straight through to writeFile, writing binary into what must stay a JSON
  // slot — unlike an object or number (which throw a TypeError from writeFile itself), a
  // Buffer is accepted silently. Reject anything that isn't a plain string before it touches disk.
  if (typeof json !== 'string') {
    throw new Error(`Refusing to write non-string payload to ${name}`)
  }
  await writeFile(resolveStorePath(name), json, 'utf-8')
})

ipcMain.handle('store:delete', async (_e, name: string): Promise<void> => {
  try {
    await unlink(resolveStorePath(name))
  } catch {
    // Already gone is success.
  }
})

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'MindMaze',
    backgroundColor: '#1a1410',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
