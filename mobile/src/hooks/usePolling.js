import { useEffect, useRef } from 'react'

export function usePolling(fn, intervalMs = 10000, deps = []) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    ref.current()
    const t = setInterval(() => ref.current(), intervalMs)
    return () => clearInterval(t)
  }, [...deps, intervalMs])
}
