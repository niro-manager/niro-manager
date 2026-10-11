import { useCallback, useRef, useState } from 'react'
import { readLogbook, type Logbook } from '../sheets/readLogbook'
import type { SheetConnection } from '../sheets/sheetsClient'

/** 앱으로 돌아왔을 때 이 시간이 지났으면 다시 읽는다(2026-10-10 합의) */
export const REFRESH_AFTER_MS = 5 * 60 * 1000

export function isStale(logbook: Logbook | null, now: number = Date.now()): boolean {
  return logbook === null || now - logbook.loadedAt.getTime() >= REFRESH_AFTER_MS
}

export interface LogbookState {
  logbook: Logbook | null
  loading: boolean
  error: string | null
  /** 시트를 읽는다. 연결 전이거나 이미 읽는 중이면 무시한다 */
  load: () => Promise<void>
  clear: () => void
}

export function useLogbook(connection: SheetConnection | null): LogbookState {
  const [logbook, setLogbook] = useState<Logbook | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const load = useCallback(
    async () => {
      if (!connection || inFlight.current) return
      inFlight.current = true
      setLoading(true)
      setError(null)
      try {
        setLogbook(await readLogbook(connection))
      } catch (e) {
        setError(e instanceof Error ? e.message : '시트를 읽지 못했습니다.')
      } finally {
        inFlight.current = false
        setLoading(false)
      }
    },
    [connection],
  )

  const clear = useCallback(() => {
    setLogbook(null)
    setError(null)
  }, [])

  return { logbook, loading, error, load, clear }
}
