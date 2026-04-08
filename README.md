# OpenWrt Manager

<div align="center">
  <img src="desktop/assets/icon.png" width="120" alt="OpenWrt Manager" />
  <h3>OpenWrt 路由器统一管理工具</h3>
  <p>无后端直连 · 局域网自动发现 · 多路由器管理 · 三端支持</p>
</div>

---

## 特性

- **无后端直连**：ubus HTTP JSON-RPC 直连路由器，无需部署任何服务器
- **局域网自动发现**：启动后自动扫描探测局域网 OpenWrt 路由器，一键连接
- **公网远程管理**：支持公网 IP/域名，图形验证码防暴力破解
- **多路由器管理**：同时管理多台设备，标题栏下拉随时切换
- **记住密码 / 自动登录**：灵活的凭证保存策略
- **实时监控**：CPU 负载、内存、流量速率实时图表
- **设备管理**：查看在线设备，一键踢出
- **防火墙规则**：增删 UCI 规则，立即生效
- **SSH 终端**：内置 xterm 终端
- **系统日志**：实时查看路由器日志

---

## 三端支持

| 端 | 技术栈 | 目录 |
|----|--------|------|
| Windows / Linux 桌面 | Electron 28 + React + Vite | `desktop/` |
| Android 手机 | React Native 0.73 | `mobile/` |
| 微信小程序 | 原生小程序 | `miniprogram/` |

---

## 项目结构

```
openwrt-manager/
├── .github/
│   ├── workflows/
│   │   ├── build-desktop.yml   # Windows + Linux 编译
│   │   ├── build-android.yml   # Android APK 编译
│   │   ├── release.yml         # 全平台发布（tag 触发）
│   │   └── ci.yml              # PR 检查
│   └── SECRETS.md              # Secrets 配置说明
│
├── shared/
│   └── openwrt-client.js       # 通用 SDK（三端共用）
│       ├── OpenWrtClient       # ubus 客户端
│       ├── LANScanner          # 局域网探测
│       ├── RouterManager       # 多路由器管理
│       └── CaptchaGenerator    # 图形验证码
│
├── desktop/                    # Electron 桌面客户端
│   ├── assets/
│   │   ├── icon.ico            # Windows 图标（16~256px 多分辨率）
│   │   ├── icon.png            # 主图标 256×256
│   │   └── tray.png            # 托盘图标 64×64
│   ├── electron/
│   │   ├── main.js             # 主进程（窗口/托盘/IPC）
│   │   └── preload.js          # 预加载脚本
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConnectionManager.jsx  # 连接管理（LAN扫描+表单+验证码）
│   │   │   └── Layout.jsx             # 主布局（侧边栏+标题栏+路由切换）
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx      # 总览
│   │   │   ├── DevicesPage.jsx        # 设备管理
│   │   │   ├── TrafficPage.jsx        # 流量统计
│   │   │   ├── FirewallPage.jsx       # 防火墙
│   │   │   ├── VPNPage.jsx            # VPN
│   │   │   ├── SystemPage.jsx         # 系统设置
│   │   │   └── TerminalPage.jsx       # SSH 终端
│   │   ├── services/openwrt.js        # 引用 shared SDK，注入 fetch
│   │   ├── store/index.js             # Zustand 状态
│   │   └── styles/global.css          # 暗色主题
│   ├── installer.nsh           # NSIS 脚本（开机自启+快捷方式选项）
│   ├── package.json
│   ├── package-lock.json       # 锁定版本（必须提交到仓库）
│   └── vite.config.js
│
├── mobile/                     # React Native Android
│   ├── App.jsx                 # 导航配置
│   ├── src/
│   │   ├── screens/            # Index/Add/Dashboard/Devices/Traffic/Firewall/System
│   │   ├── services/openwrt.js # RN fetch 版客户端
│   │   ├── store/index.js
│   │   └── hooks/usePolling.js
│   ├── android/
│   │   ├── app/build.gradle    # ABI 分包 + 签名
│   │   └── app/src/main/res/xml/network_security_config.xml
│   ├── package.json
│   └── package-lock.json
│
└── miniprogram/                # 微信小程序
    ├── utils/openwrt.js        # wx.request 版客户端
    ├── pages/                  # index/add/dashboard/devices/traffic/firewall/system
    ├── app.js / app.json / app.wxss
    └── project.config.json     # 填入 AppID 后导入开发者工具
```

---

## 路由器端配置（首次使用必做）

```bash
# 1. 安装依赖
opkg update && opkg install rpcd uhttpd-mod-ubus luci-mod-rpc

# 2. 开启 CORS
uci set uhttpd.main.ubus_cors=1
uci commit uhttpd && /etc/init.d/uhttpd restart

# 3. 配置 ACL 权限
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

# 4. 验证（替换密码）
curl -s -X POST http://192.168.1.1/ubus \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"call","params":
       ["00000000000000000000000000000000","session","login",
        {"username":"root","password":"YOUR_PASSWORD"}]}' | python3 -m json.tool
# 返回包含 ubus_rpc_session 即成功
```

---

## 安装方式

### Windows

| 文件 | 系统 | 说明 |
|------|------|------|
| `*-win10-x64-setup.exe` | Windows 10/11 64位 | **推荐**，NSIS 安装包 |
| `*-win10-x64-portable.exe` | Windows 10/11 64位 | 便携版，免安装 |
| `*-win10-ia32-setup.exe` | Windows 10/11 32位 | 32位系统 |
| `*-win7-x64-setup.exe` | Win 7/8/8.1 64位 | 兼容旧系统（Electron 22）|
| `*-win7-ia32-setup.exe` | Win 7/8/8.1 32位 | 兼容旧系统 |

安装时可选择：
- **安装目录**（自定义路径）
- **桌面快捷方式**（默认勾选）
- **开机自动启动**（默认不勾选）

### Linux

#### Ubuntu / Debian / Deepin / UOS / 统信 / 优麒麟（UKylin）

```bash
sudo apt install ./OpenWrtManager-*-linux-x64.deb
```

#### CentOS / RHEL / Fedora / 银河麒麟 / 中标麒麟

```bash
# Fedora / RHEL 8+
sudo dnf install OpenWrtManager-*-linux-x64.rpm

# CentOS 7 / RHEL 7
sudo yum localinstall OpenWrtManager-*-linux-x64.rpm
```

#### 所有 Linux（AppImage，免安装运行）

```bash
chmod +x OpenWrtManager-*-linux-x64.AppImage
./OpenWrtManager-*-linux-x64.AppImage
```

#### Arch Linux / Manjaro

```bash
sudo pacman -U OpenWrtManager-*-linux-x64.pacman
```

#### 国产系统对应表

| 系统 | 推荐包 |
|------|-------|
| Deepin 20/23 | `.deb` |
| 统信 UOS | `.deb` |
| 优麒麟 UKylin | `.deb` |
| 银河麒麟 | `.rpm` |
| 中标麒麟 NeoKylin | `.rpm` |
| openKylin | `.deb` |

> 遇到依赖问题时，优先使用 AppImage 版（直接运行，无需安装）。

### Android

手机设置开启「允许安装未知来源应用」后，安装对应架构的 APK：

| 文件 | 适用设备 |
|------|---------|
| `*-android-arm64.apk` | 主流 Android 手机（**推荐**）|
| `*-android-armv7.apk` | 老款 Android 手机 |
| `*-android-universal.apk` | 通用包（不确定时选此）|

### 微信小程序

见 [`miniprogram/README.md`](./miniprogram/README.md)。

---

## 本地开发

### 桌面端

```bash
cd desktop
npm install
npm run dev          # 开发模式（同时启动 Vite + Electron）
npm run build        # 仅构建前端
npm run dist         # 构建 + 打包（当前平台）

# 手动指定平台打包
npx electron-builder --win --x64          # Windows x64
npx electron-builder --win --ia32         # Windows x86
npx electron-builder --linux deb rpm AppImage  # Linux
```

### 手机端

```bash
cd mobile
npm install
npm start            # 启动 Metro
npm run android      # 运行到 Android
npm run build:release  # 打 Release APK
```

### 微信小程序

1. 下载[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入 `miniprogram/` 目录
3. 在 `project.config.json` 填入 AppID
4. 点击「编译」预览

---

## 发布（GitHub Actions）

```bash
# 打 tag 触发全平台编译，约 20 分钟后出现在 Release 页面
git tag v1.0.0 && git push origin v1.0.0

# 预发布版（包含 alpha/beta/rc 关键字自动标记为 prerelease）
git tag v1.1.0-beta.1 && git push origin v1.1.0-beta.1
```

签名配置见 [`.github/SECRETS.md`](.github/SECRETS.md)。

---

## 常见问题

**Q: 打开后黑屏？**  
旧版本的 Vite + Electron 兼容问题（`crossorigin` + `file://` 协议冲突）。请使用最新版本。

**Q: 局域网扫描找不到路由器？**  
确认已完成路由器端配置，特别是 `ubus_cors=1` 和 `rpcd` 重启。

**Q: 连接提示权限不足？**  
执行路由器端 ACL 配置后重试。

**Q: 公网如何使用？**  
填写公网 IP/DDNS 域名即可。建议改非默认端口，最安全是路由器开 WireGuard 后以局域网模式使用。

**Q: 微信小程序正式版连不上路由器？**  
小程序正式版只允许 HTTPS 备案域名。开发阶段勾选「不校验域名」即可，正式使用需配置域名 + HTTPS 证书。

**Q: 国产系统安装失败？**  
优先使用 AppImage 版，`chmod +x` 后直接运行，无依赖要求。

---

## License

MIT
