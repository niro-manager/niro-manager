// 빌드 시 주입하는 Google 설정. 모두 브라우저에 공개되는 값이며 비밀값이 아니다.
// API 키는 Google Cloud에서 배포 주소(HTTP 리퍼러)와 Picker API로 사용을 제한한다.

export interface GoogleConfig {
  /** OAuth 클라이언트 ID */
  clientId: string
  /** Google Picker용 API 키 */
  apiKey: string
  /** Google Cloud 프로젝트 번호. Picker로 고른 파일에 앱 접근을 허용할 때 쓴다 */
  appId: string
}

export function readGoogleConfig(env: Record<string, string | undefined> = import.meta.env): GoogleConfig | null {
  const clientId = env.VITE_GOOGLE_CLIENT_ID?.trim()
  const apiKey = env.VITE_GOOGLE_API_KEY?.trim()
  const appId = env.VITE_GOOGLE_APP_ID?.trim()
  if (!clientId || !apiKey || !appId) return null
  return { clientId, apiKey, appId }
}
