import { defineConfig } from 'vite';

// https://vitejs.dev/config
// ponytail: async + dynamic import — both plugins are ESM-only and forge's config loader requires() them otherwise
export default defineConfig(async () => {
  const [{ default: react }, { default: tailwindcss }] = await Promise.all([
    import('@vitejs/plugin-react'),
    import('@tailwindcss/vite'),
  ]);
  return { plugins: [react(), tailwindcss()] };
});
