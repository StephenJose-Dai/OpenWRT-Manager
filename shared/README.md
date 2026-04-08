# Shared — 通用 SDK

三端（桌面、手机、小程序）共用的 OpenWrt 通信核心库。

## 文件

```
shared/
└── openwrt-client.js    # 全量 SDK（含所有类）
```

## 导出的类和函数

| 名称 | 说明 |
|------|------|
| `OpenWrtClient` | ubus HTTP JSON-RPC 客户端 |
| `OpenWrtError` | ubus 错误类（含错误码） |
| `LANScanner` | 局域网路由器自动探测 |
| `RouterManager` | 多路由器配置管理（增删查，持久化） |
| `CaptchaGenerator` | 图形验证码生成（Canvas，适用浏览器 / Electron） |
| `WxFetcher` | 微信小程序 `wx.request` 适配器 |
| `WxStorage` | 微信小程序 `wx.storage` 适配器 |
| `WebStorage` | 浏览器 `localStorage` 适配器 |
| `makeRNStorage` | React Native `AsyncStorage` 适配器工厂 |

## 各端引用方式

### 桌面端（Electron + Vite）

```js
// vite.config.js 中配置 alias: '@shared' → '../shared'
import { OpenWrtClient, LANScanner, RouterManager } from '@shared/openwrt-client.js'
```

### 手机端（React Native）

```js
// 直接相对路径引用（RN 的 Metro bundler 支持）
import { OpenWrtClient, RouterManager } from '../../shared/openwrt-client.js'
// 注意：RN 端使用内置 fetch，需注入到 OpenWrtClient
const client = new OpenWrtClient({ ...config, fetcher: fetch })
```

### 微信小程序

```js
// 小程序有独立的 utils，已在 miniprogram/utils/openwrt.js 中封装
// 直接用小程序专用版本即可（基于 wx.request 实现）
const { OpenWrtClient } = require('../../utils/openwrt')
```

## OpenWrtClient 使用示例

```js
// 创建客户端
const client = new OpenWrtClient({
  host:     '192.168.1.1',
  port:     80,          // 默认 80
  username: 'root',      // 默认 root
  password: 'yourpassword',
  fetcher:  fetch,       // 注入 fetch（桌面/RN）
})

// 登录（自动缓存 session，5 分钟内免重登）
await client.login()

// 调用 ubus 方法
const info  = await client.getSystemInfo()
const ifaces = await client.getNetworkInterfaces()
const leases = await client.getDHCPLeases()

// 通用 call 接口
const result = await client.call('system', 'board')
const rules  = await client.call('uci', 'get', { config: 'firewall' })

// 执行命令
const out = await client.execCommand('logread', ['-l', '100'])
console.log(out.stdout)

// 重启
await client.reboot()
```

## LANScanner 使用示例

```js
const scanner = new LANScanner(fetch, 1500)  // 1500ms 超时

// scan() 返回 Promise<Array>，onFound 是实时回调
const found = await scanner.scan((item) => {
  console.log('发现路由器:', item.host)
})
```

## RouterManager 使用示例

```js
import { RouterManager, WebStorage } from './shared/openwrt-client.js'

const mgr = new RouterManager(WebStorage)  // 或 WxStorage / makeRNStorage(AsyncStorage)

// 加载已保存的路由器
await mgr.load()

// 添加路由器
const id = await mgr.addRouter({
  label:            '家里路由器',
  host:             '192.168.1.1',
  username:         'root',
  password:         'mypassword',
  rememberPassword: true,
  autoLogin:        true,
})

// 获取客户端
const client = mgr.getClient(id, fetch)

// 列出所有路由器
const list = mgr.listRouters()

// 删除
await mgr.removeRouter(id)
```
