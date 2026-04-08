import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Vite 插件：移除 HTML 中的 crossorigin 属性
// crossorigin + file:// 协议会导致 Electron 黑屏
function removeElectronCrossorigin() {
  return {
    name: 'remove-electron-crossorigin',
    transformIndexHtml(html) {
      return html
        .replace(/<script\s+type="module"\s+crossorigin\s+/g,  '<script type="module" ')
        .replace(/<link\s+rel="stylesheet"\s+crossorigin\s+/g, '<link rel="stylesheet" ')
        .replace(/<link\s+rel="modulepreload"\s+crossorigin[^>]*>/g, '')
        .replace(/\s+crossorigin/g, '')
    }
  }
}

export default defineConfig({
  plugins: [react(), removeElectronCrossorigin()],
  base: './',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    modulePreload: false,
    commonjsOptions: {
      include: [/shared\//, /node_modules\//]
    },
    rollupOptions: {
      external: [
        '@xterm/xterm',
        '@xterm/addon-fit',
        '@xterm/xterm/css/xterm.css'
      ],
      input: { main: resolve(__dirname, 'index.html') },
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-ui':     ['lucide-react', 'zustand'],
        }
      }
    }
  },

  resolve: {
    alias: {
      '@':       resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared')
    }
  },

  optimizeDeps: {
    exclude: ['@xterm/xterm', '@xterm/addon-fit'],
    include: ['../shared/openwrt-client.js']
  },

  server: {
    port: 5173,
    strictPort: true
  }
})
