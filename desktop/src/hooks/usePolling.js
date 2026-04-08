import { useEffect, useRef } from 'react'

/**
 * 轮询 hook —— 组件挂载时立即执行一次，之后每隔 interval ms 执行
 * 组件卸载时自动清除定时器
 */
export function usePolling(fn, interval = 10000, deps = []) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    fnRef.current()
    const t = setInterval(() => fnRef.current(), interval)
    return () => clearInterval(t)
  }, [...deps, interval])
}
