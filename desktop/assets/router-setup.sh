#!/bin/sh
# OpenWrt Manager 路由器端配置脚本
# 在路由器 SSH 或 LuCI 终端执行此脚本

echo ">>> 安装必要软件包..."
opkg update
opkg install rpcd-mod-file luci-mod-rpc

echo ">>> 配置 ACL 权限..."
cat > /usr/share/rpcd/acl.d/owm.json << 'EOF'
{
  "root": {
    "description": "OpenWrt Manager full access",
    "read": {
      "ubus": { "*": [ "*" ] },
      "uci": { "*": [ "read" ] },
      "file": {
        "/proc/net/dev": [ "read" ],
        "/proc/net/arp": [ "read" ],
        "/tmp/dhcp.leases": [ "read" ],
        "/tmp/*": [ "read" ],
        "/etc/config/*": [ "read" ],
        "/usr/sbin/*": [ "exec" ],
        "/usr/bin/*": [ "exec" ],
        "/bin/*": [ "exec" ],
        "/sbin/*": [ "exec" ],
        "/etc/init.d/*": [ "exec" ]
      }
    },
    "write": {
      "ubus": { "*": [ "*" ] },
      "uci": { "*": [ "read", "write" ] },
      "file": {
        "/tmp/*": [ "read", "write" ],
        "/etc/config/*": [ "read", "write" ],
        "/usr/sbin/*": [ "exec" ],
        "/usr/bin/*": [ "exec" ],
        "/bin/*": [ "exec" ],
        "/sbin/*": [ "exec" ],
        "/etc/init.d/*": [ "exec" ]
      }
    }
  }
}
EOF

echo ">>> 开启 CORS（允许跨域访问 ubus）..."
uci set uhttpd.main.ubus_cors=1
uci commit uhttpd

echo ">>> 重启 rpcd 和 uhttpd..."
/etc/init.d/rpcd restart
sleep 1
/etc/init.d/uhttpd restart

echo ">>> 完成！请重新连接路由器"
