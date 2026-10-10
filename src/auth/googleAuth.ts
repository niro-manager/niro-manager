import { loadScript } from './loadScript'

// 인증 계층: Google Identity Services 토큰 방식. 토큰은 메모리에만 둔다.
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
// 만료 직전 토큰으로 요청하지 않도록 두는 여유 시간
const EXPIRY_MARGIN_MS = 60_000

export interface AccessToken {
  token: string
  expiresAt: number
}

export function isTokenValid(token: AccessToken | null, now = Date.now()): token is AccessToken {
  return token !== null && token.expiresAt - EXPIRY_MARGIN_MS > now
}

/**
 * 로그인 팝업으로 액세스 토큰을 받는다. 버튼 클릭 같은 사용자 동작 안에서 호출해야 팝업이 막히지 않는다.
 * 이미 동의한 계정이면 팝업이 바로 닫힌다.
 */
export async function requestAccessToken(clientId: string): Promise<AccessToken> {
  await loadScript(GIS_SRC)
  return new Promise<AccessToken>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description ?? response.error ?? '로그인에 실패했습니다.'))
          return
        }
        const expiresIn = Number(response.expires_in ?? 3600)
        resolve({ token: response.access_token, expiresAt: Date.now() + expiresIn * 1000 })
      },
      error_callback: (error) => {
        reject(new Error(error.type === 'popup_closed' ? '로그인 창이 닫혔습니다.' : (error.message ?? '로그인 창을 열 수 없습니다.')))
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}

export async function revokeAccessToken(token: AccessToken): Promise<void> {
  await loadScript(GIS_SRC)
  await new Promise<void>((resolve) => google.accounts.oauth2.revoke(token.token, resolve))
}
