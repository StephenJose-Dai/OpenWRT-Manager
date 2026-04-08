# Mobile 手机 APP

基于 React Native 0.73 构建的跨平台手机应用，支持 Android（iOS 可通过调整 `android/` 为 `ios/` 支持）。

## 目录结构

```
mobile/
├── src/
│   ├── screens/
│   │   ├── IndexScreen.jsx      # 路由器列表 + 局域网扫描
│   │   ├── AddScreen.jsx        # 添加/编辑路由器（含验证码）
│   │   ├── DashboardScreen.jsx  # 控制台总览
│   │   ├── DevicesScreen.jsx    # 设备管理
│   │   ├── TrafficScreen.jsx    # 流量统计
│   │   ├── FirewallScreen.jsx   # 防火墙规则
│   │   ├── VPNScreen.jsx        # VPN 管理
│   │   └── SystemScreen.jsx     # 系统设置
│   ├── components/
│   │   ├── StatusDot.jsx        # 在线状态指示点
│   │   ├── StatCard.jsx         # 统计卡片
│   │   └── RouterCard.jsx       # 路由器卡片
│   ├── services/
│   │   └── openwrt.js           # OpenWrt ubus 客户端（适配 fetch API）
│   ├── hooks/
│   │   └── usePolling.js        # 轮询 hook
│   └── store/
│       └── index.js             # Zustand 全局状态
├── android/
│   ├── app/
│   │   ├── build.gradle         # ABI 分包 + 签名配置
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       └── res/xml/
│   │           └── network_security_config.xml  # 允许 LAN HTTP
│   └── build.gradle
├── index.js                     # RN 入口
├── App.jsx                      # 根组件（导航配置）
├── package.json
└── README.md
```

## 本地开发

```bash
cd mobile
npm install

# Android（需要 Android Studio + SDK）
npx react-native run-android

# 仅构建 Bundle（不启动 Metro）
npx react-native bundle --platform android --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
```

## 签名配置（发布版）

Release 构建时需要签名证书：

```bash
# 生成证书
keytool -genkey -v -keystore android/app/release.keystore \
  -alias openwrt-manager -keyalg RSA -keysize 2048 -validity 10000

# 本地构建（带签名）
cd android
./gradlew assembleRelease \
  -PkeystoreFile=app/release.keystore \
  -PkeyAlias=openwrt-manager \
  -PkeyPassword=YOUR_KEY_PASS \
  -PstorePassword=YOUR_STORE_PASS
```

APK 输出路径：`android/app/build/outputs/apk/release/`

## 支持的 Android 架构

| APK 文件 | 架构 | 适用设备 |
|----------|------|----------|
| `*-arm64-v8a-release.apk` | ARM64 | 2016年后主流手机（推荐）|
| `*-armeabi-v7a-release.apk` | ARMv7 | 老款手机 |
| `*-x86_64-release.apk` | x86_64 | 模拟器/部分平板 |
| `*-x86-release.apk` | x86 | 老款模拟器 |
| `*-universal-release.apk` | 全架构 | 通用包（体积较大）|

最低支持 Android 5.0（API 21），覆盖约 99% 的在役 Android 设备。
