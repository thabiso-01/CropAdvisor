import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// In development the site proxies API calls to the FastAPI backend (default http://localhost:8000).
// In Docker, nginx does the same, so the browser only ever talks to one origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.API_PROXY_TARGET || 'http://localhost:8000'
  const proxy = { target, changeOrigin: true }
  return {
    plugins: [react()],
    server: { port: 5173, host: true, proxy: { '/api': proxy, '/uploads': proxy, '/health': proxy } },
    preview: { port: 4173, proxy: { '/api': proxy, '/uploads': proxy, '/health': proxy } },
  }
})
