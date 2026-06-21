import { defineConfig } from 'vite';

// https://vitejs.dev/config
// ponytail: pin output name so it doesn't collide with main's index.js
export default defineConfig({
  build: { rollupOptions: { output: { entryFileNames: 'preload.js' } } },
});
