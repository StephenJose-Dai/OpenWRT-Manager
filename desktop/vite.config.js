import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',

  build: {
    outDir:   'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,   // 提高警告阈值，避免大 bundle 警告
    commonjsOptions: {
      // 让 Rollup 能处理 shared/ 目录中的 CommonJS 模块
      include: [/shared\//, /node_modules\//]
    },
    rollupOptions: {
      // xterm 在 Electron 运行时由 node_modules 直接提供，不打入 bundle
      external: [
        '@xterm/xterm',
        '@xterm/addon-fit',
        '@xterm/xterm/css/xterm.css'
      ],
      input: { main: resolve(__dirname, 'index.html') },
      output: {
        // 手动分包：把大型库拆分到独立 chunk，加快首屏加载
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts':  ['recharts'],
          'vendor-ui':      ['lucide-react', 'zustand'],
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
