# OpenWrt Manager

无后端直连版 OpenWrt 路由器管理工具，通过 ubus HTTP JSON-RPC 直接与路由器通信，无需部署任何服务器。

## 功能

- **局域网自动发现**：启动后自动扫描探测路由器，一键连接
- **公网远程管理**：支持手动填写 IP/域名，图形验证码防暴力破解
- **多路由器管理**：同时管理多台设备，随时切换
- **记住密码 / 自动登录**：灵活的凭证保存策略
- **实时监控**：CPU 负载、内存、网络接口、流量速率
- **设备管理**：查看 DHCP 租约，一键踢出设备
- **防火墙规则**：增删 UCI 防火墙规则，实时生效
- **系统设置**：WiFi 密码修改、系统日志、重启、软件升级检查

## 三端支持

| 端 | 技术栈 | 目录 |
|----|--------|------|
| 桌面客户端 | Electron 28 + React + Vite | [`desktop/`](./desktop/) |
| 手机 APP | React Native 0.73 | [`mobile/`](./mobile/) |
| 微信小程序 | 原生小程序 WXML/WXSS/JS | [`miniprogram/`](./miniprogram/) |

共用 SDK：[`shared/openwrt-client.js`](./shared/openwrt-client.js)

## 路由器端配置（一次性）

SSH 进入路由器执行：

```bash
# 安装依赖
opkg update
opkg install rpcd uhttpd-mod-ubus luci-mod-rpc

# 开启跨域访问（CORS）
uci set uhttpd.main.ubus_cors=1
uci commit uhttpd
/etc/init.d/uhttpd restart

# 配置权限
cat > /usr/share/rpcd/acl.d/manager.json << 'EOF'
{
  "manager": {
    "description": "OpenWrt Manager 访问权限",
    "read":  { "ubus": { "*": ["*"] }, "uci": { "*": ["read"] } },
    "write": { "ubus": { "*": ["*"] }, "uci": { "*": ["read","write"] } }
  }
}
EOF
/etc/init.d/rpcd restart
```

验证：
```bash
curl -s -X POST http://192.168.1.1/ubus \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"call","params":["00000000000000000000000000000000","session","login",{"username":"root","password":"你的密码"}]}'
# 返回 ubus_rpc_session 即成功
```

## 发布（GitHub Actions）

推送 tag 自动构建全平台：

```bash
git tag v1.0.0
git push origin v1.0.0
```

产物（约 20 分钟后出现在 Release 页面）：
- `*-win10-x64-setup.exe` — Windows 10/11 64 位
- `*-win10-ia32-setup.exe` — Windows 10/11 32 位
- `*-win7-x64-setup.exe` — Windows 7/8/8.1 64 位（Electron 22）
- `*-win7-ia32-setup.exe` — Windows 7/8/8.1 32 位
- `*-android-arm64.apk` — 主流 Android 手机
- `*-android-armv7.apk` — 老款 Android 手机
- `*-android-universal.apk` — Android 通用包

详见 [`.github/SECRETS.md`](.github/SECRETS.md) 配置签名证书。

## 目录结构

```
openwrt-manager/
├── .github/
│   ├── workflows/
│   │   ├── release.yml          # 主发布流程（tag 触发，并行编译所有平台）
│   │   ├── build-desktop.yml    # Windows 单独编译
│   │   ├── build-android.yml    # Android 单独编译
│   │   └── ci.yml               # PR 检查
│   └── SECRETS.md               # Secrets 配置指南
├── shared/
│   └── openwrt-client.js        # 通用 SDK（三端共用）
├── desktop/                     # Electron 桌面客户端
├── mobile/                      # React Native 手机 APP
├── miniprogram/                 # 微信小程序
└── README.md
```

## License

MIT
