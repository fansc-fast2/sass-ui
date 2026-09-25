import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// platform-api（Go 后端）地址；dev/preview 都通过代理转发，浏览器侧零 CORS。
const BACKEND = process.env.PLATFORM_API_URL ?? 'http://127.0.0.1:8090'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: '127.0.0.1',
    proxy: {
      '/health': { target: BACKEND, changeOrigin: false },
      '/v1': { target: BACKEND, changeOrigin: false },
      '/integrations': { target: BACKEND, changeOrigin: false },
    },
  },
  preview: {
    port: 5174,
    host: '127.0.0.1',
    proxy: {
      '/health': { target: BACKEND, changeOrigin: false },
      '/v1': { target: BACKEND, changeOrigin: false },
      '/integrations': { target: BACKEND, changeOrigin: false },
    },
  },
})
