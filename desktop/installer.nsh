; installer.nsh - 自定义 NSIS 安装脚本
; 添加：开机自启动选项、桌面快捷方式选项

!macro customHeader
  ; 定义开机自启变量
  Var /GLOBAL AutoStartCheckbox
  Var /GLOBAL DesktopShortcutCheckbox
!macroend

!macro customWelcomePage
!macroend

!macro customInstall
  ; 写入开机自启注册表项（如果用户勾选）
  ${NSD_GetState} $AutoStartCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
      "OpenWrtManager" "$INSTDIR\OpenWrt Manager.exe"
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenWrtManager"
  ${EndIf}
!macroend

!macro customUnInstall
  ; 卸载时删除开机自启注册表项
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenWrtManager"
  ; 删除桌面快捷方式
  Delete "$DESKTOP\OpenWrt Manager.lnk"
!macroend

!macro customInstallMode
!macroend
