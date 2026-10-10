import { describe, expect, it } from 'vitest'
import { isTokenValid } from './googleAuth'
import { readGoogleConfig } from '../config'

describe('isTokenValid', () => {
  it('만료 1분 전부터는 유효하지 않다고 본다', () => {
    const now = 1_000_000
    expect(isTokenValid(null, now)).toBe(false)
    expect(isTokenValid({ token: 't', expiresAt: now + 120_000 }, now)).toBe(true)
    expect(isTokenValid({ token: 't', expiresAt: now + 30_000 }, now)).toBe(false)
  })
})

describe('readGoogleConfig', () => {
  it('세 값이 모두 있어야 설정으로 인정한다', () => {
    expect(readGoogleConfig({ VITE_GOOGLE_CLIENT_ID: 'c', VITE_GOOGLE_API_KEY: 'k', VITE_GOOGLE_APP_ID: '1' })).toEqual({ clientId: 'c', apiKey: 'k', appId: '1' })
    expect(readGoogleConfig({ VITE_GOOGLE_CLIENT_ID: 'c', VITE_GOOGLE_API_KEY: ' ', VITE_GOOGLE_APP_ID: '1' })).toBeNull()
    expect(readGoogleConfig({})).toBeNull()
  })
})
