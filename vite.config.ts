import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'
import fs from 'node:fs'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    electron([
      { entry: 'electron/main.ts' },
    ]),
    renderer(),
    {
      name: 'preload-plugin',
      apply: 'build',
      async writeBundle() {
        const dest = path.join(__dirname, 'dist-electron/preload.js')
        // Create a simple CommonJS version of the preload
        const content = `const { contextBridge } = require('electron')\n\ncontextBridge.exposeInMainWorld('mindmaze', {\n  ping: () => 'pong',\n})\n`
        fs.writeFileSync(dest, content)
      },
    },
  ],
})
