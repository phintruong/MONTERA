import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The three.js chunk (~1.2 MB, ~330 KB gzipped) is the whole 3D viewer and can't be lazy-loaded;
    // warn only if it, or the app chunk, grows past that.
    chunkSizeWarningLimit: 1300,
    rolldownOptions: {
      output: {
        // three.js is most of the bundle and changes far less often than the app: its own cacheable file.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/](three|three-stdlib|camera-controls|@react-three)[\\/]/ },
          ],
        },
      },
    },
  },
})
