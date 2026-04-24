import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Fall back to the wrangler dev default so `npm run dev` just works when
  // the Worker is running locally via `wrangler dev`.
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8787'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: env.VITE_API_URL
        ? undefined
        : {
            '/api': {
              target: apiTarget,
              changeOrigin: true,
            },
          },
    },
  }
})
