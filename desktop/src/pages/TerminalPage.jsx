import React, { useEffect, useRef, useState } from 'react'
import { Terminal as TermIcon } from 'lucide-react'

export default function TerminalPage({ client, config }) {
  const ref  = useRef(null)
  const term = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(()=>{
    let xt, fit, ws
    const init = async () => {
      const { Terminal } = await import('xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      await import('xterm/css/xterm.css')
      xt  = new Terminal({ theme:{background:'#0d1117',foreground:'#c9d1d9',cursor:'#58a6ff'}, fontFamily:'"Cascadia Code",monospace', fontSize:14, cursorBlink:true })
      fit = new FitAddon()
      xt.loadAddon(fit)
      xt.open(ref.current)
      fit.fit()
      term.current = xt
      setReady(true)

      xt.writeln('\x1b[1;34m OpenWrt Manager — SSH 终端\x1b[0m')
      xt.writeln('\x1b[33m提示：此终端通过 ubus file.exec 执行命令\x1b[0m')
      xt.writeln('')

      let cmd = ''
      xt.onKey(({ key, domEvent }) => {
        if (domEvent.key === 'Enter') {
          xt.writeln('')
          execCmd(cmd)
          cmd = ''
        } else if (domEvent.key === 'Backspace') {
          if (cmd.length > 0) { cmd = cmd.slice(0,-1); xt.write('\b \b') }
        } else {
          cmd += key; xt.write(key)
        }
      })

      const ro = new ResizeObserver(() => fit.fit())
      ro.observe(ref.current)
    }

    const execCmd = async (cmd) => {
      if (!cmd.trim()) { xt.write('\r\n$ '); return }
      const parts = cmd.trim().split(' ')
      try {
        const r = await client.execCommand(parts[0], parts.slice(1))
        const out = (r.stdout||r.stderr||'').trimEnd()
        if (out) xt.writeln(out.replace(/\n/g,'\r\n'))
      } catch(e) {
        xt.writeln(`\x1b[31m错误: ${e.message}\x1b[0m`)
      }
      xt.write('\r\n$ ')
    }

    init().catch(e=>console.error(e))
    return () => { xt?.dispose() }
  },[client])

  return (
    <div className="page terminal-page" style={{height:'100%',display:'flex',flexDirection:'column'}}>
      <div className="page-header">
        <h1><TermIcon size={18}/> SSH 终端</h1>
        <span style={{fontSize:13,color:'#8b949e'}}>
          {config?.host}  ·  通过 ubus 执行命令
        </span>
      </div>
      <div className="card" style={{flex:1,padding:0,overflow:'hidden'}}>
        <div ref={ref} style={{width:'100%',height:'100%',minHeight:480}}/>
      </div>
    </div>
  )
}
