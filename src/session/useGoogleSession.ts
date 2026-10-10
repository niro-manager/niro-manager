import { useCallback, useRef, useState } from 'react'
import { isTokenValid, requestAccessToken, revokeAccessToken, type AccessToken } from '../auth/googleAuth'
import { readGoogleConfig, type GoogleConfig } from '../config'

export interface GoogleSession {
  config: GoogleConfig | null
  /** 유효한 액세스 토큰. 없거나 만료되면 null */
  token: string | null
  signingIn: boolean
  error: string | null
  /** 사용자 동작(클릭) 안에서 호출한다. 성공하면 토큰을 돌려준다 */
  signIn: () => Promise<string | null>
  signOut: () => Promise<void>
  /** API가 401을 돌려줬을 때 호출해 토큰을 버린다 */
  expire: () => void
  /** 지금 시점에 유효한 토큰(이벤트 처리기에서 쓰기 위함). 로그인 창은 열지 않는다 */
  currentToken: () => string | null
}

const config = readGoogleConfig()

export function useGoogleSession(): GoogleSession {
  const [accessToken, setAccessTokenState] = useState<AccessToken | null>(null)
  const tokenRef = useRef<AccessToken | null>(null)
  const setAccessToken = useCallback((next: AccessToken | null) => {
    tokenRef.current = next
    setAccessTokenState(next)
  }, [])
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    if (!config) {
      setError('Google 설정(클라이언트 ID, API 키, 프로젝트 번호)이 빌드에 없습니다.')
      return null
    }
    setSigningIn(true)
    setError(null)
    try {
      const next = await requestAccessToken(config.clientId)
      setAccessToken(next)
      return next.token
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다.')
      return null
    } finally {
      setSigningIn(false)
    }
  }, [setAccessToken])

  const signOut = useCallback(async () => {
    const current = accessToken
    setAccessToken(null)
    if (current) await revokeAccessToken(current).catch(() => undefined)
  }, [accessToken, setAccessToken])

  const expire = useCallback(() => setAccessToken(null), [setAccessToken])
  const currentToken = useCallback(() => (isTokenValid(tokenRef.current) ? tokenRef.current.token : null), [])

  return {
    config,
    token: isTokenValid(accessToken) ? accessToken.token : null,
    signingIn,
    error,
    signIn,
    signOut,
    expire,
    currentToken,
  }
}
