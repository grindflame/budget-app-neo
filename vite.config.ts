import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // In local dev, proxy /api/* to your Cloudflare Pages deployment (or any other target).
  // This keeps frontend calls as same-origin (/api/...) while avoiding CORS pain.
  //
  // Override with:
  //   VITE_API_TARGET=https://<your-pages-domain>
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || 'https://neo-budget.pages.dev';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
        }
      }
    }
  };
})
