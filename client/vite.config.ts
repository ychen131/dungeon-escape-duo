import { defineConfig } from 'vite'
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    outDir: 'dist',
    // watch: {
    //   // Watch mode options
    //   include: ['src/**'],
    // },
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  server: {
    // Proxy is only needed for development, and we're handling production URLs directly in the client code
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000', // Only proxy to local dev server
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      }
    }
  }
}) 