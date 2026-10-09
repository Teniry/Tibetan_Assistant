import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 使用根路径资源，确保 React 深层路由直接刷新时仍能加载 JS/CSS。
  base: '/',
  server: {
    host: '0.0.0.0',           // 监听所有网卡接口，允许局域网/公网访问
    port: 5173,
    strictPort: false,
    cors: true,                // 启用 CORS
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  // 生产环境预览服务器也支持公网访问
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true
      }
    }
  }
});
