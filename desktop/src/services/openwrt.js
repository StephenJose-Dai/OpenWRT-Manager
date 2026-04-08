/**
 * 桌面端 OpenWrt 服务层
 * 引用 shared SDK，注入浏览器 fetch
 */

// 在 Electron/Vite 环境中用 alias 引用 shared
// vite.config.js 中 @shared → ../shared
import { OpenWrtClient, LANScanner, RouterManager, CaptchaGenerator, WebStorage } from '@shared/openwrt-client.js'

export { OpenWrtClient, LANScanner, RouterManager, CaptchaGenerator, WebStorage }

// 创建带 fetch 的客户端
export function createClient(config) {
  return new OpenWrtClient({
    ...config,
    fetcher: window.fetch.bind(window)
  })
}

// 全局单例
export const routerManager = new RouterManager(WebStorage)
export const lanScanner    = new LANScanner(window.fetch.bind(window), 1500)
export const captcha       = new CaptchaGenerator(120, 40)
