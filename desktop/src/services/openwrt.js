import { OpenWrtClient, LANScanner, RouterManager, CaptchaGenerator, WebStorage } from '@shared/openwrt-client.js'

export { OpenWrtClient, LANScanner, RouterManager, CaptchaGenerator, WebStorage }

export function createClient(config) {
  return new OpenWrtClient({
    ...config,
    fetcher: window.fetch.bind(window)
  })
}
