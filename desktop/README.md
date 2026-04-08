# Desktop 桌面客户端

基于 Electron + React + Vite 构建的 Windows 桌面应用。

## 目录结构

```
desktop/
├── electron/
│   ├── main.js          # Electron 主进程（窗口、托盘、IPC）
│   └── preload.js       # 预加载脚本（contextBridge 暴露 API）
├── src/
│   ├── components/
│   │   ├── ConnectionManager.jsx  # 连接管理（LAN扫描、手动添加、验证码）
│   │   ├── ConnectionManager.css
│   │   └── Layout.jsx             # 主布局（侧边栏、标题栏、路由）
│   ├── pages/
│   │   ├── LoginPage.jsx          # 登录页
│   │   ├── DashboardPage.jsx      # 总览（CPU、内存、流量图表）
│   │   ├── DevicesPage.jsx        # 设备管理（踢出、搜索）
│   │   ├── TrafficPage.jsx        # 流量统计（实时图表）
│   │   ├── FirewallPage.jsx       # 防火墙规则
│   │   ├── VPNPage.jsx            # VPN 管理
│   │   ├── SystemPage.jsx         # 系统设置（WiFi、日志、重启）
│   │   └── TerminalPage.jsx       # SSH 终端（xterm.js）
│   ├── services/
│   │   └── api.js                 # OpenWrt ubus 封装（引用 shared SDK）
│   ├── hooks/
│   │   └── useWebSocket.js        # 实时数据轮询 hook
│   ├── store/
│   │   └── index.js               # Zustand 全局状态
│   ├── styles/
│   │   └── global.css             # 全局暗色主题样式
│   └── App.jsx                    # 根组件（路由配置）
├── assets/
│   ├── icon.ico                   # Windows 图标（需自行提供）
│   └── icon.png                   # 通用图标
├── public/
│   └── favicon.ico
├── package.json                   # 含 electron-builder 完整配置
├── vite.config.js
└── README.md
```

## 本地开发

```bash
cd desktop
npm install
npm run dev        # 同时启动 Vite dev server 和 Electron
```

## 构建

```bash
npm run build      # 只构建前端资源
npm run dist       # 构建前端 + 打包 Electron（当前平台）
npm run dist:win-x64    # 强制打 Windows x64
npm run dist:win-ia32   # 强制打 Windows ia32（32位）
```

产物在 `dist-electron/` 目录下。

## 关于 Windows 7/8 兼容性

- **Windows 10/11**：使用最新 Electron（当前 v28），功能完整
- **Windows 7/8/8.1**：GitHub Actions 自动使用 Electron 22.3.27 编译独立版本

Electron 23 起已放弃 Win7/8 支持（因 Chromium 110 不再支持），故需要两个版本。

## 图标说明

请在 `assets/` 下放置以下文件（GitHub Actions 编译时需要）：

- `icon.ico`：Windows 图标，建议 256×256（多分辨率 ICO）
- `icon.png`：256×256 PNG，用于 Linux/macOS 和安装包预览

可用 [GIMP](https://www.gimp.org/) 或在线工具生成 ICO 文件。
