/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // Vite 8 (Rolldown): `rolldownOptions.output.codeSplitting` replaces the
    // deprecated `rollupOptions.output.manualChunks`. Route pages are already
    // split via React.lazy in src/App.tsx; these groups keep the vendor code
    // in stable, separately cacheable chunks.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@tanstack|axios)[\\/]/,
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](@chakra-ui|@emotion|framer-motion|motion-dom|motion-utils|@ark-ui|@zag-js|@pandacss)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
})
