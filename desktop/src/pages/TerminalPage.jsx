import React, { useEffect, useRef } from 'react'
import { Terminal as TermIcon } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export default function TerminalPage({ client, config }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background:          '#0d1117',
        foreground:          '#c9d1d9',
        cursor:              '#58a6ff',
        selectionBackground: '#264f78',
        black:               '#484f58',
        brightBlack:         '#6e7681',
        red:                 '#ff7b72',
        green:               '#3fb950',
        yellow:              '#d29922',
        blue:                '#58a6ff',
        magenta:             '#bc8cff',
        cyan:                '#39c5cf',
        white:               '#b1bac4',
      },
      fontFamily:  '"Cascadia Code", "JetBrains Mono", "Consolas", monospace',
      fontSize:    14,
      lineHeight:  1.5,
      cursorBlink: true,
      scrollback:  2000,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    term.writeln('\x1b[1;34m╔═══════════════════════════════════╗\x1b[0m')
    term.writeln('\x1b[1;34m║    OpenWrt Manager  Terminal      ║\x1b[0m')
    term.writeln('\x1b[1;34m╚═══════════════════════════════════╝\x1b[0m')
    term.writeln('')
    term.writeln('\x1b[32m已连接到 ' + ((config && config.host) || '路由器') + '\x1b[0m')
    term.writeln('\x1b[33m通过 ubus file.exec 执行命令（需路由器安装 rpcd + luci-mod-rpc）\x1b[0m')
    term.writeln('\x1b[90m若提示 PERMISSION_DENIED，请在路由器执行：\x1b[0m')
    term.writeln('\x1b[90m  opkg install rpcd-mod-file && /etc/init.d/rpcd restart\x1b[0m')
    term.writeln('')
    term.writeln('\x1b[90m如遇 PERMISSION_DENIED，请在路由器执行：\x1b[0m')
    term.writeln('\x1b[90m  opkg install rpcd-mod-file\x1b[0m')
    term.writeln('\x1b[90m  /etc/init.d/rpcd restart\x1b[0m')
    term.writeln('')
    term.write('$ ')

    let cmdBuf = ''
    let history = []
    let histIdx  = -1

    const execCmd = async (cmd) => {
      const trimmed = cmd.trim()
      if (!trimmed) { term.write('\r\n$ '); return }

      // 命令历史
      history = [trimmed, ...history.filter(c => c !== trimmed)].slice(0, 100)
      histIdx = -1

      const parts = trimmed.split(/\s+/)
      try {
        const r   = await client.execCommand(parts[0], parts.slice(1))
        const out = (r.stdout || r.stderr || '').trimEnd()
        if (out) term.writeln(out.replace(/\r?\n/g, '\r\n'))
      } catch (e) {
        term.writeln('\x1b[31m错误: ' + e.message + '\x1b[0m')
      }
      term.write('\r\n$ ')
    }

    term.onKey(function({ key, domEvent }) {
      // Ctrl+C
      if (domEvent.ctrlKey && domEvent.key === 'c') {
        term.writeln('^C')
        term.write('$ ')
        cmdBuf = ''
        return
      }
      // Ctrl+L 清屏
      if (domEvent.ctrlKey && domEvent.key === 'l') {
        term.clear()
        term.write('$ ' + cmdBuf)
        return
      }

      switch (domEvent.key) {
        case 'Enter':
          term.writeln('')
          execCmd(cmdBuf)
          cmdBuf = ''
          break

        case 'Backspace':
          if (cmdBuf.length > 0) {
            cmdBuf = cmdBuf.slice(0, -1)
            term.write('\b \b')
          }
          break

        case 'ArrowUp':
          if (history.length > 0) {
            histIdx = Math.min(histIdx + 1, history.length - 1)
            // 清除当前行
            term.write('\r$ ' + ' '.repeat(cmdBuf.length) + '\r$ ')
            cmdBuf = history[histIdx]
            term.write(cmdBuf)
          }
          break

        case 'ArrowDown':
          histIdx = Math.max(histIdx - 1, -1)
          term.write('\r$ ' + ' '.repeat(cmdBuf.length) + '\r$ ')
          cmdBuf = histIdx >= 0 ? history[histIdx] : ''
          term.write(cmdBuf)
          break

        default:
          if (!domEvent.ctrlKey && !domEvent.altKey && !domEvent.metaKey && key) {
            cmdBuf += key
            term.write(key)
          }
      }
    })

    const ro = new ResizeObserver(function() { try { fit.fit() } catch (e) {} })
    ro.observe(containerRef.current)

    return function() { ro.disconnect(); term.dispose() }
  }, [client, config])

  return (
    <div className="page terminal-page"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <h1><TermIcon size={18} /> SSH 终端</h1>
        <span style={{ fontSize: 13, color: '#8b949e' }}>
          {(config && config.host) || '—'} &nbsp;·&nbsp; ubus file.exec
        </span>
      </div>
      <div className="card"
        style={{ flex: 1, padding: 0, overflow: 'hidden', minHeight: 420 }}>
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', minHeight: 420 }}
        />
      </div>
    </div>
  )
}
