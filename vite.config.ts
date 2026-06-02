import { defineConfig } from 'vite';

/** Browser-first build — no Electron plugins */
export default defineConfig({
  base: './',
  build: {
    // three.js alone is ~510 kB; that's the known floor for this vendor chunk.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split the heavy audio/graphics libraries into separate vendor chunks
        // so they cache independently of app code across deploys.
        manualChunks: {
          three: ['three'],
          tone: ['tone'],
        },
      },
    },
  },
});
