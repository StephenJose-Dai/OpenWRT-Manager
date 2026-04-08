import { create } from 'zustand'

export const useAppStore = create((set, get) => ({
  // 当前连接
  client:  null,
  config:  null,
  online:  false,

  // 实时数据
  sysInfo:    null,
  interfaces: [],
  devices:    [],
  trafficHistory: [],   // [{rx, tx, ts}] 最近 30 个采样

  setConnection: (client, config) => set({ client, config, online: true }),
  setOnline:     (v) => set({ online: v }),
  disconnect:    () => set({ client: null, config: null, online: false, sysInfo: null }),

  setSysInfo:    (info) => set({ sysInfo: info }),
  setInterfaces: (list) => set({ interfaces: list }),
  setDevices:    (list) => set({ devices: list }),

  addTrafficSnapshot: (snap) => set(s => ({
    trafficHistory: [...s.trafficHistory, snap].slice(-30)
  })),
  clearTrafficHistory: () => set({ trafficHistory: [] }),
}))
