#!/bin/sh
# OpenWrt Manager 路由器端一键配置脚本
# 通过 SSH 执行：sh /path/to/router-setup.sh

echo ">>> 安装必要软件包..."
opkg update
opkg install rpcd-mod-file luci-mod-rpc

echo ">>> 开启 CORS..."
uci set uhttpd.main.ubus_cors=1
uci commit uhttpd

echo ">>> 创建 ACL 权限文件..."
cat > /usr/share/rpcd/acl.d/owm.json << 'EOF'
{
  "root": {
    "read": {
      "ubus": {"*": ["*"]},
      "uci":  {"*": ["read"]},
      "file": {"*": ["read","exec","list"]}
    },
    "write": {
      "ubus": {"*": ["*"]},
      "uci":  {"*": ["read","write"]},
      "file": {"*": ["read","write","exec","list"]}
    }
  }
}
EOF

echo ">>> 重启服务..."
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart

echo ">>> 完成！请重新连接路由器"
