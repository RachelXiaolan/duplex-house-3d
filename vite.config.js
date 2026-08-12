import { defineConfig } from 'vite';
// base: './' → GitHub Pages / 任意子路径均可直接部署，无需改配置
export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
