import { defineConfig } from 'vite';

// https://vitejs.dev/config
// ponytail: pin output name — entry is src/main/index.ts but forge/package.json expect main.js
// externalize the ffmpeg binaries so their __dirname-based paths resolve from node_modules, not the bundle dir
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['ffmpeg-static', 'ffprobe-static'],
      output: { entryFileNames: 'main.js' },
    },
  },
});
