import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // 关键：将 Vite 根目录指向 web/，否则访问 / 会 404
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      'react-native$': 'react-native-web',
      'react-native': 'react-native-web',
      // 在 Web 端将 react-native-video 指向空实现，避免 requireNativeComponent 抛错
      'react-native-video': path.resolve(__dirname, './shims/react-native-video.ts'),
      // FastImage 在 Web 上不可用，这里提供一个安全的空实现（但我们默认通过 SmartImage.web 使用 <img>，不会直接依赖）
      'react-native-fast-image': path.resolve(__dirname, './shims/react-native-fast-image.ts'),
      '@': path.resolve(__dirname, '../'),
    },
  },
  optimizeDeps: {
    exclude: ['react-native'],
    include: ['react-native-web', 'react-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/session': { target: 'http://localhost:8000', changeOrigin: true },
      '/thumbnail-list': { target: 'http://localhost:8000', changeOrigin: true },
      '/media': { target: 'http://localhost:8000', changeOrigin: true },
      '/media-resource': { target: 'http://localhost:8000', changeOrigin: true },
      '/tags': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  define: {
    'process.env.API_BASE_URL': JSON.stringify(process.env.API_BASE_URL || ''),
  },
});
