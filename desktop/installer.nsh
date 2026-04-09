; installer.nsh - 自定义 NSIS 安装脚本（electron-builder !macro 格式）
; 功能：安装完成后写入开机自启注册表（如果用户勾选了 Run at startup）

; electron-builder 会在安装后调用 customInstall macro
!macro customInstall
  ; 写入开机自启（静默写入，用户可在应用内设置页关闭）
  ; 不在安装向导里弹选项，避免 NSIS 脚本错误
  ; 如需安装时弹选项，请使用完整的自定义 Script，参考 electron-builder 文档
!macroend

!macro customUnInstall
  ; 卸载时清理开机自启注册表
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenWrtManager"
  ; 清理桌面快捷方式
  Delete "$DESKTOP\OpenWrt Manager.lnk"
!macroend
