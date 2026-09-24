import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // /api 开头的请求转发到后端，前端直接写相对路径即可，不触发跨域
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  }
})
