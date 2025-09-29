import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/session': { target: 'http://localhost:8000', changeOrigin: true },
      '/media-resource-list': { target: 'http://localhost:8000', changeOrigin: true },
      '/thumbnail-list': { target: 'http://localhost:8000', changeOrigin: true },
      '/tag': { target: 'http://localhost:8000', changeOrigin: true },
      '/tags': { target: 'http://localhost:8000', changeOrigin: true },
      '/media': { target: 'http://localhost:8000', changeOrigin: true },
      '/media-resource': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
});