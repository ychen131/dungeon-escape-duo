import { defineConfig } from 'vite'
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    outDir: 'dist',
    watch: {
      // Watch mode options
      include: ['src/**'],
    },
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      }
    }
  }
}) 