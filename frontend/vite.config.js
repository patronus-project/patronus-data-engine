import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '')
  const apiPort = env.PORT || 3000

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
    build: {
      outDir: '../public',
      emptyOutDir: true,
    },
  }
})
