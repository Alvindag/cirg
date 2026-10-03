import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: string | undefined
  loading: boolean
  reload: () => void
  /** When the data on screen was last fetched successfully (ms since the epoch). */
  updatedAt: number | undefined
  /** True when a background refresh failed and what is shown is older than it should be. */
  stale: boolean
}

export interface AsyncOptions {
  /** Fetch again in the background every this many ms while the tab is visible. The old data stays on screen until the new arrives. */
  refreshMs?: number
}

/**
 * Runs `fn` on mount and whenever `deps` change; ignores results that arrive after a newer request started.
 * With `refreshMs` it keeps the data live: it refreshes quietly (no loading flicker), pauses while the tab is hidden,
 * catches up when the person comes back, and keeps the last good data (marked stale) if a refresh fails.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], options: AsyncOptions = {}): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<number>()
  const [stale, setStale] = useState(false)
  const latest = useRef(0)
  const background = useRef(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const { refreshMs } = options

  useEffect(() => {
    const id = ++latest.current
    const quiet = background.current
    background.current = false
    if (!quiet) setLoading(true)
    fnRef
      .current()
      .then((d) => {
        if (id !== latest.current) return
        setData(d)
        setError(undefined)
        setStale(false)
        setUpdatedAt(Date.now())
      })
      .catch((e: unknown) => {
        if (id !== latest.current) return
        if (quiet) setStale(true) // keep what is on screen; the badge says it is out of date
        else setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (id === latest.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!refreshMs) return
    const refresh = () => {
      if (document.hidden) return
      background.current = true
      setTick((t) => t + 1)
    }
    const timer = setInterval(refresh, refreshMs)
    const onVisible = () => {
      if (!document.hidden && updatedAtRef.current !== undefined && Date.now() - updatedAtRef.current >= refreshMs) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [refreshMs])

  const updatedAtRef = useRef<number | undefined>(undefined)
  updatedAtRef.current = updatedAt

  return { data, error, loading, reload, updatedAt, stale }
}

/** The newest successful refresh across several requests, and whether any of them is out of date. */
export function liveStatus(...states: AsyncState<unknown>[]): { updatedAt: number | undefined; stale: boolean } {
  const times = states.map((s) => s.updatedAt).filter((t): t is number => t !== undefined)
  return { updatedAt: times.length ? Math.min(...times) : undefined, stale: states.some((s) => s.stale) }
}
