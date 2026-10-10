import { useCallback, useState } from 'react'
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
}

const config = readGoogleConfig()

export function useGoogleSession(): GoogleSession {
  const [accessToken, setAccessToken] = useState<AccessToken | null>(null)
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
  }, [])

  const signOut = useCallback(async () => {
    const current = accessToken
    setAccessToken(null)
    if (current) await revokeAccessToken(current).catch(() => undefined)
  }, [accessToken])

  const expire = useCallback(() => setAccessToken(null), [])

  return {
    config,
    token: isTokenValid(accessToken) ? accessToken.token : null,
    signingIn,
    error,
    signIn,
    signOut,
    expire,
  }
}
