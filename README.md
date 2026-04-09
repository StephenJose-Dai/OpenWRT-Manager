# OpenWrt Manager

<div align="center">
  <img src="desktop/assets/icon.png" width="128" alt="OpenWrt Manager" />
  <h3>OpenWrt 路由器统一管理工具</h3>
  <p>无后端直连 · 局域网自动发现 · 多路由器管理 · 三端支持</p>

  [![Build Desktop](https://github.com/YOUR_USERNAME/openwrt-manager/actions/workflows/build-desktop.yml/badge.svg)](https://github.com/YOUR_USERNAME/openwrt-manager/actions)
  [![Build Android](https://github.com/YOUR_USERNAME/openwrt-manager/actions/workflows/build-android.yml/badge.svg)](https://github.com/YOUR_USERNAME/openwrt-manager/actions)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
</div>

---

## 功能特性

| 功能 | 说明 |
|------|------|
| **无后端直连** | 通过 ubus HTTP JSON-RPC 直连路由器，无需部署任何服务器或代理 |
| **局域网自动发现** | 启动后自动探测局域网内 OpenWrt 路由器，一键连接 |
| **公网远程管理** | 支持公网 IP / DDNS 域名，图形验证码防暴力破解 |
| **多路由器管理** | 同时保存多台设备配置，标题栏下拉随时切换 |
| **记住密码 / 自动登录** | 灵活的凭证保存策略，可选开机自动登录 |
| **实时监控** | CPU 负载、内存占用、网络流量速率实时图表 |
| **设备管理** | 查看 DHCP 在线设备列表，一键踢出 |
| **防火墙规则** | 增删 UCI 防火墙规则，立即生效 |
| **WiFi 密码修改** | 在线修改 WiFi 密码，无需进入 LuCI |
| **SSH 终端** | 内置 xterm 终端，直接在 GUI 里执行路由器命令 |
| **系统日志** | 实时查看路由器 syslog 日志 |
| **VPN 管理** | OpenVPN 服务控制（需路由器已安装 OpenVPN）|

---

## 支持平台

### 桌面客户端（Windows / Linux）

#### Windows

| 版本 | 最低系统要求 | 架构 | 备注 |
|------|------------|------|------|
| win10 | Windows 10 1903+ | x64 / ia32 | 使用 Electron 28，推荐 |
| win10 | Windows 11 所有版本 | x64 / ia32 | 同上 |
| win7 | Windows 7 SP1（需安装补丁 KB2533623）| x64 / ia32 | 使用 Electron 22，兼容旧系统 |
| win7 | Windows 8 / 8.1 | x64 / ia32 | 同上 |
| win7 | Windows Server 2008 R2 SP1 | x64 | 同上 |

> **Windows 7 注意**：需安装 [KB2533623](https://support.microsoft.com/kb/2533623) 和 [KB3063858](https://support.microsoft.com/kb/3063858) 补丁，以及 Visual C++ 2015 Redistributable。

#### Linux

| 包格式 | 适用发行版 | 最低版本 |
|--------|-----------|---------|
| `.deb` | **Ubuntu** | 18.04 LTS (Bionic) 及以上 |
| `.deb` | **Debian** | 10 (Buster) 及以上 |
| `.deb` | **Deepin（深度）** | 20 及以上 |
| `.deb` | **统信 UOS** | 20 及以上（家庭版/专业版/服务器版）|
| `.deb` | **优麒麟 UKylin** | 20.04 及以上 |
| `.deb` | **openKylin（开放麒麟）** | 1.0 及以上 |
| `.rpm` | **CentOS** | 7 及以上（需 EPEL）|
| `.rpm` | **RHEL（红帽）** | 7 及以上 |
| `.rpm` | **Fedora** | 30 及以上 |
| `.rpm` | **银河麒麟 Kylin** | V10 及以上（服务器版基于 RHEL）|
| `.rpm` | **中标麒麟 NeoKylin** | V7 及以上（基于 CentOS/RHEL）|
| `.rpm` | **AlmaLinux / Rocky Linux** | 8 及以上 |
| `.AppImage` | **所有 Linux** | 内核 3.2+（glibc 2.17+），无依赖，直接运行 |
| `.pacman` | **Arch Linux** | 最新滚动版 |
| `.pacman` | **Manjaro** | 21 及以上 |
| `.pacman` | **EndeavourOS / Garuda Linux** | 支持 |

> **arm64 包**：适用于 ARM64 架构的服务器、树莓派 4/5、以及搭载 ARM 芯片的 Linux 设备。
> 
> **国产系统说明**：不确定用哪个包时，优先选 `.AppImage`——无需安装，`chmod +x` 后直接运行，兼容性最强。

### 手机 APP（Android）

| APK 文件 | 架构 | 适用设备 | Android 最低版本 |
|---------|------|---------|----------------|
| `*-android-arm64.apk` | ARM64 | 2016 年后主流手机（华为/小米/OPPO/vivo/三星 等）| Android 5.0 (API 21) |
| `*-android-armv7.apk` | ARMv7 | 2016 年前老款手机 | Android 5.0 (API 21) |
| `*-android-x86_64.apk` | x86_64 | Intel/AMD 处理器平板、Chrome OS、部分模拟器 | Android 5.0 (API 21) |
| `*-android-universal.apk` | 全架构 | 通用包（体积较大，不确定时选此）| Android 5.0 (API 21) |

> **覆盖率**：arm64 + armv7 合计覆盖约 99% 的在役 Android 设备。

### 微信小程序

- 微信版本：7.0.0 及以上
- iOS：14.0 及以上
- Android：7.0 及以上
- 正式版仅支持 HTTPS 域名（开发版/体验版无限制）

---

## 项目结构

```
openwrt-manager/
├── .github/
│   ├── workflows/
│   │   ├── build-desktop.yml   # Windows + Linux 独立编译（可手动触发）
│   │   ├── build-android.yml   # Android APK（可手动触发）
│   │   ├── release.yml         # 全平台发布（推 tag 触发）
│   │   └── ci.yml              # PR 代码检查
│   └── SECRETS.md              # GitHub Secrets 配置说明
│
├── shared/
│   └── openwrt-client.js       # 通用 ubus SDK（三端共用）
│
├── desktop/                    # Electron 桌面客户端
│   ├── assets/
│   │   ├── icon.ico            # Windows 图标（16~256px 多分辨率）
│   │   ├── icon.png            # 主图标 256×256
│   │   └── tray.png            # 系统托盘图标 64×64
│   ├── electron/
│   │   ├── main.js             # 主进程（窗口/托盘/IPC/CSP）
│   │   └── preload.js          # 预加载脚本
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConnectionManager.jsx  # 连接管理（LAN扫描+表单+验证码）
│   │   │   └── Layout.jsx             # 主布局（侧边栏+标题栏+路由切换）
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx      # 总览（CPU/内存/流量图表）
│   │   │   ├── DevicesPage.jsx        # 设备管理（DHCP列表+踢出）
│   │   │   ├── TrafficPage.jsx        # 流量统计（实时折线图）
│   │   │   ├── FirewallPage.jsx       # 防火墙规则（UCI增删）
│   │   │   ├── VPNPage.jsx            # VPN 管理（OpenVPN控制）
│   │   │   ├── SystemPage.jsx         # 系统设置（信息/WiFi/日志）
│   │   │   └── TerminalPage.jsx       # SSH 终端（xterm.js）
│   │   ├── services/openwrt.js        # 引用 shared SDK，注入 fetch
│   │   ├── store/index.js             # Zustand 全局状态
│   │   └── styles/global.css          # 暗色主题 CSS
│   ├── installer.nsh           # NSIS 卸载清理脚本
│   ├── package.json            # 依赖 + electron-builder 配置
│   ├── package-lock.json       # 锁定版本（必须提交）
│   └── vite.config.js          # Vite 配置（含 crossorigin 修复插件）
│
├── mobile/                     # React Native Android
│   ├── App.jsx                 # 根组件（导航配置）
│   ├── src/
│   │   ├── screens/            # Index / Add / Dashboard / Devices /
│   │   │                       # Traffic / Firewall / System
│   │   ├── services/openwrt.js # RN fetch 版 ubus 客户端
│   │   ├── store/index.js      # Zustand 全局状态
│   │   └── hooks/usePolling.js # 轮询 hook
│   ├── android/
│   │   ├── app/build.gradle    # ABI 分包 + 签名配置
│   │   └── app/src/main/res/xml/network_security_config.xml
│   ├── package.json
│   └── package-lock.json
│
└── miniprogram/                # 微信小程序
    ├── utils/openwrt.js        # wx.request 版 ubus 客户端
    ├── pages/                  # index / add / dashboard / devices /
    │                           # traffic / firewall / system
    ├── app.js / app.json / app.wxss
    └── project.config.json     # 填入 AppID 后导入微信开发者工具
```

---

## 路由器端配置（首次使用必做）

SSH 进路由器执行（**只需配置一次**）：

```bash
# 1. 安装依赖包
opkg update
opkg install rpcd uhttpd-mod-ubus luci-mod-rpc

# 2. 开启 CORS（允许 App 跨域访问 ubus API）
uci set uhttpd.main.ubus_cors=1
uci commit uhttpd
/etc/init.d/uhttpd restart

# 3. 配置访问权限（ACL）
cat > /usr/share/rpcd/acl.d/manager.json << 'EOF'
{
  "manager": {
    "description": "OpenWrt Manager 访问权限",
    "read":  { "ubus": {"*":["*"]}, "uci": {"*":["read"]} },
    "write": { "ubus": {"*":["*"]}, "uci": {"*":["read","write"]} }
  }
}
EOF
/etc/init.d/rpcd restart

# 4. 验证配置（替换 YOUR_PASSWORD 为路由器密码）
curl -s -X POST http://192.168.1.1/ubus \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"call","params":
       ["00000000000000000000000000000000","session","login",
        {"username":"root","password":"YOUR_PASSWORD"}]}' \
  | python3 -m json.tool
# 返回包含 "ubus_rpc_session" 字段即表示配置成功
```

---

## 安装方式

### Windows

双击运行安装包，安装过程可选择：
- 自定义安装路径
- 是否创建桌面快捷方式（默认勾选）
- 是否创建开始菜单快捷方式（默认勾选）

| 文件 | 适用系统 | 架构 |
|------|---------|------|
| `*-win10-x64-setup.exe` | Windows 10/11 | 64位 ✅ **推荐** |
| `*-win10-x64-portable.exe` | Windows 10/11 | 64位，免安装直接运行 |
| `*-win10-ia32-setup.exe` | Windows 10/11 | 32位 |
| `*-win7-x64-setup.exe` | Windows 7/8/8.1 | 64位（Electron 22 兼容版）|
| `*-win7-ia32-setup.exe` | Windows 7/8/8.1 | 32位（Electron 22 兼容版）|

### Linux

#### Ubuntu / Debian / Deepin / UOS / UKylin / openKylin

```bash
# 方法1（推荐）
sudo apt install ./OpenWrtManager-*-linux-x64.deb

# 方法2（旧版 apt）
sudo dpkg -i OpenWrtManager-*-linux-x64.deb
sudo apt-get install -f    # 修复可能缺失的依赖
```

#### CentOS / RHEL / Fedora / 银河麒麟 / 中标麒麟

```bash
# Fedora / RHEL 8+ / AlmaLinux / Rocky Linux
sudo dnf install OpenWrtManager-*-linux-x64.rpm

# CentOS 7 / RHEL 7
sudo yum localinstall OpenWrtManager-*-linux-x64.rpm

# 银河麒麟 V10（基于 RHEL/CentOS）
sudo yum localinstall OpenWrtManager-*-linux-x64.rpm
```

#### 所有 Linux（AppImage，无需安装，兼容性最强）

```bash
chmod +x OpenWrtManager-*-linux-x64.AppImage
./OpenWrtManager-*-linux-x64.AppImage

# 可选：集成到系统（添加到应用菜单）
./OpenWrtManager-*-linux-x64.AppImage --install
```

#### Arch Linux / Manjaro / EndeavourOS

```bash
sudo pacman -U OpenWrtManager-*-linux-x64.pacman
```

#### 国产操作系统对应表

| 国产系统 | 推荐安装包 | 最低版本 |
|---------|-----------|---------|
| Deepin（深度）| `.deb` | 20 |
| 统信 UOS | `.deb` | 20（家庭版/专业版均支持）|
| 优麒麟 UKylin | `.deb` | 20.04 |
| openKylin（开放麒麟）| `.deb` | 1.0 |
| 银河麒麟 Kylin | `.rpm` | V10 SP1 |
| 中标麒麟 NeoKylin | `.rpm` | V7 |
| 中科方德 NFSChina | `.rpm` | 4.0 |
| 红旗 Linux | `.rpm` | 11 |
| 麒麟软件 KylinOS | `.rpm` | V10 |

> 遇到依赖问题时，统一使用 **AppImage** 版本，无需安装任何依赖，`chmod +x` 直接运行。

### Android

手机端开启「允许安装未知来源应用」，下载对应架构安装：

```bash
# 查看手机 CPU 架构（adb 方式）
adb shell getprop ro.product.cpu.abi
# arm64-v8a  → 下载 arm64 版
# armeabi-v7a → 下载 armv7 版
```

不确定架构时直接下载 **universal（通用）** 版。

### 微信小程序

见 [`miniprogram/README.md`](./miniprogram/README.md)。

---

## 本地开发

### 环境要求

| 工具 | 版本要求 |
|------|---------|
| Node.js | 18.0.0 及以上（推荐 LTS）|
| npm | 9.0.0 及以上 |
| Android Studio | 2022.3 及以上（手机端）|
| JDK | 17 及以上（手机端）|
| 微信开发者工具 | 1.06 及以上（小程序）|

### 桌面端

```bash
cd desktop
npm install

# 开发模式（同时启动 Vite dev server 和 Electron）
npm run dev

# 仅编译前端
npm run build

# 打包当前平台
npm run dist

# 指定平台打包
npx electron-builder --win --x64              # Windows x64
npx electron-builder --win --ia32             # Windows x86
npx electron-builder --linux deb rpm AppImage # Linux（当前架构）
```

### 手机端（Android）

```bash
cd mobile
npm install

npm start          # 启动 Metro bundler
npm run android    # 运行到已连接的 Android 设备/模拟器

# 打 Release APK（需配置签名）
cd android && ./gradlew assembleRelease
```

### 微信小程序

1. 打开[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 「导入项目」→ 选择 `miniprogram/` 目录
3. 填入你的 AppID（在[微信公众平台](https://mp.weixin.qq.com)注册获取）
4. 点击「编译」预览效果

---

## 发布（GitHub Actions）

### 自动发布（推荐）

```bash
# 正式版（自动触发全平台编译，约 20 分钟出现在 Release 页面）
git tag v1.0.0 && git push origin v1.0.0

# 预发布版（自动标记为 pre-release）
git tag v1.1.0-beta.1 && git push origin v1.1.0-beta.1
git tag v2.0.0-rc.1   && git push origin v2.0.0-rc.1
```

### 手动编译

在 Actions 页面选择对应 workflow → 点击「Run workflow」：
- `Build Desktop` → 只编译 Windows + Linux
- `Build Android APK` → 只编译 Android
- `Release (All Platforms)` → 全平台

### 签名配置

在仓库 **Settings → Secrets → Actions** 添加：

| Secret 名称 | 说明 | 是否必须 |
|------------|------|---------|
| `ANDROID_KEYSTORE_BASE64` | Android 签名证书 Base64 | 可选（不配置用 debug 签名）|
| `ANDROID_KEY_ALIAS` | Key 别名 | 配置签名时必须 |
| `ANDROID_KEY_PASSWORD` | Key 密码 | 配置签名时必须 |
| `ANDROID_STORE_PASSWORD` | Keystore 密码 | 配置签名时必须 |

详见 [`.github/SECRETS.md`](.github/SECRETS.md)。

---

## 常见问题

**Q: 安装打开后黑屏？**  
旧版本的 Vite + Electron 兼容问题（`crossorigin` 属性 + `file://` 协议冲突导致脚本无法加载）。请下载最新版本，v1.0.0 起已彻底修复。

**Q: 局域网扫描扫不到路由器？**  
确认已完成[路由器端配置](#路由器端配置首次使用必做)步骤，特别是 `ubus_cors=1` 和重启 `uhttpd`、`rpcd`。

**Q: 连接提示"权限不足"或 ubus 错误 6？**  
执行 ACL 配置步骤并重启 rpcd：`/etc/init.d/rpcd restart`

**Q: 公网如何使用？**  
在「添加路由器」填写公网 IP 或 DDNS 域名即可。建议：①修改 uhttpd 为非默认端口；②更安全的方案是配置 WireGuard VPN，客户端先连 VPN 再以局域网 IP 使用。

**Q: 微信小程序正式版连不上路由器？**  
正式版只允许 HTTPS 备案域名。开发阶段在开发者工具「详情 → 本地设置」勾选「不校验合法域名」即可。生产环境需为路由器配置域名 + Let's Encrypt 证书。

**Q: AppImage 提示缺少 FUSE？**  
```bash
sudo apt install libfuse2       # Ubuntu 22.04+
sudo apt install fuse           # Ubuntu 20.04 及更早
# 或者用 --appimage-extract-and-run 参数直接运行（无需 FUSE）
./OpenWrtManager-*.AppImage --appimage-extract-and-run
```

**Q: 国产系统（银河麒麟等）安装 rpm 失败？**  
先试 `rpm --nodeps -i *.rpm`，或直接用 AppImage 版跳过依赖问题。

**Q: Windows 7 提示缺少 DLL？**  
安装 [Visual C++ 2015-2022 Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) 后重试。

---

## License

MIT © OpenWrt Manager Contributors  
本项目与 OpenWrt 官方项目无关联，为独立开发的第三方管理工具。
