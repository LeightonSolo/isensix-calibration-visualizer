/** Configures the React calendar development server and production build into the Worker's static assets. */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'generated-file-purpose-header',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk') {
            output.code = `/** Generated calendar UI bundle; rebuild from the documented files in calendar/src. */\n${output.code}`
          }
        }
      },
    },
  ],
  base: '/calendar/',
  build: {
    outDir: '../flat-tree-380f/public/calendar',
    emptyOutDir: true,
  },
})
