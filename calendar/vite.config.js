import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/calendar/',
  build: {
    outDir: '../flat-tree-380f/public/calendar',
    emptyOutDir: true,
  },
})