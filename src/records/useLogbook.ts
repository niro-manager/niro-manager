import { useCallback, useRef, useState } from 'react'
import type { Settings } from '../settings/settings'
import { readLogbook, type Logbook } from '../sheets/readLogbook'
import { SheetsError } from '../sheets/sheetsClient'

/** 앱으로 돌아왔을 때 이 시간이 지났으면 다시 읽는다(2026-10-10 합의) */
export const REFRESH_AFTER_MS = 5 * 60 * 1000

export function isStale(logbook: Logbook | null, now: number = Date.now()): boolean {
  return logbook === null || now - logbook.loadedAt.getTime() >= REFRESH_AFTER_MS
}

export interface LogbookState {
  logbook: Logbook | null
  loading: boolean
  error: string | null
  /** 시트를 읽는다. 이미 읽는 중이면 무시한다. 401이면 onAuthExpired를 부른다 */
  load: (token: string, onAuthExpired: () => void) => Promise<void>
  clear: () => void
}

export function useLogbook(settings: Settings): LogbookState {
  const [logbook, setLogbook] = useState<Logbook | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const load = useCallback(
    async (token: string, onAuthExpired: () => void) => {
      if (!settings.spreadsheetId || inFlight.current) return
      inFlight.current = true
      setLoading(true)
      setError(null)
      try {
        setLogbook(await readLogbook(token, settings))
      } catch (e) {
        if (e instanceof SheetsError && e.kind === 'auth') onAuthExpired()
        setError(e instanceof Error ? e.message : '시트를 읽지 못했습니다.')
      } finally {
        inFlight.current = false
        setLoading(false)
      }
    },
    [settings],
  )

  const clear = useCallback(() => {
    setLogbook(null)
    setError(null)
  }, [])

  return { logbook, loading, error, load, clear }
}
