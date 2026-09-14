import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            lib: { entry: 'electron/main.ts', formats: ['cjs'], fileName: () => 'main.cjs' },
            rollupOptions: { external: ['electron'] },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) { args.reload() },
        vite: {
          build: {
            lib: { entry: 'electron/preload.ts', formats: ['cjs'], fileName: () => 'preload.cjs' },
            rollupOptions: { external: ['electron'] },
          },
        },
      },
    ]),
  ],
})
