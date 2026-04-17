# GitHub Secrets 配置指南

在仓库 **Settings → Secrets and variables → Actions** 中添加以下 Secret：

---

## Android 签名（可选，不配置则用 debug 签名）

| Secret 名称 | 说明 | 如何获取 |
|-------------|------|----------|
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的 Base64 编码 | 见下方生成步骤 |
| `ANDROID_KEY_ALIAS` | key 别名 | 生成时设置的值 |
| `ANDROID_KEY_PASSWORD` | key 密码 | 生成时设置的值 |
| `ANDROID_STORE_PASSWORD` | keystore 密码 | 生成时设置的值 |

### 生成签名证书

```bash
# 1. 生成 keystore
keytool -genkey -v \
  -keystore release.keystore \
  -alias openwrt-manager \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -dname "CN=OpenWrt Manager, OU=Dev, O=YourOrg, L=City, S=State, C=CN"

# 2. 转为 Base64（复制输出内容粘贴到 Secret）
base64 -i release.keystore | tr -d '\n'
# macOS: base64 release.keystore | tr -d '\n'
# Windows PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

> ⚠️ **重要**：keystore 文件必须妥善备份！一旦丢失无法重新签名，已上架的应用将无法更新。

---

## Windows 代码签名（可选，不配置则无数字签名）

| Secret 名称 | 说明 |
|-------------|------|
| `WIN_CSC_LINK` | .p12 证书文件的 Base64 编码 |
| `WIN_CSC_KEY_PASSWORD` | 证书密码 |

> 开源项目可不配置，用户安装时会有 SmartScreen 警告，点"仍要运行"即可。
> 购买 EV 代码签名证书（约 $300/年）可消除警告。

---

## 触发发布

```bash
# 打 tag 即可触发全平台编译和发布
git tag v26.4.171630
git push origin v26.4.171630

# 发布预览版（beta/alpha/rc 关键词触发 prerelease）
git tag v1.1.0-beta.1
git push origin v1.1.0-beta.1
```

---

## 产物说明

打完 tag 后，Actions 会并行编译所有平台，约 15-25 分钟后在 GitHub Release 页面看到：

```
OpenWrtManager-v26.4.171630-win10-x64-setup.exe      # Windows 10/11 64位安装包（推荐）
OpenWrtManager-v26.4.171630-win10-x64-portable.exe   # Windows 10/11 64位便携版
OpenWrtManager-v26.4.171630-win10-ia32-setup.exe     # Windows 10/11 32位
OpenWrtManager-v26.4.171630-win7-x64-setup.exe       # Windows 7/8/8.1 64位
OpenWrtManager-v26.4.171630-win7-ia32-setup.exe      # Windows 7/8/8.1 32位
OpenWrtManager-v26.4.171630-android-arm64.apk        # Android 主流手机（推荐）
OpenWrtManager-v26.4.171630-android-armv7.apk        # Android 老款手机
OpenWrtManager-v26.4.171630-android-x86_64.apk       # Android 模拟器/平板
OpenWrtManager-v26.4.171630-android-x86.apk          # 老款模拟器
OpenWrtManager-v26.4.171630-android-universal.apk    # Android 通用包
```

共 10 个产物，全部自动上传到 Release。
