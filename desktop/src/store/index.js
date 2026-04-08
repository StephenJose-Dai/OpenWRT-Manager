import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 路由器连接状态（不持久化，每次启动重新连接）
export const useConnectionStore = create((set) => ({
  client:  null,
  config:  null,
  manager: null,
  online:  false,
  setConnection: ({ client, config, manager }) => set({ client, config, manager, online: true }),
  setOnline:     (online) => set({ online }),
  disconnect:    () => set({ client: null, config: null, online: false })
}))

// 用户偏好（持久化到 localStorage）
export const usePrefsStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme:            'dark',
      pollInterval:     10000,   // 自动刷新间隔 ms
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setPollInterval:     (v) => set({ pollInterval: v }),
    }),
    { name: 'openwrt-prefs' }
  )
)
