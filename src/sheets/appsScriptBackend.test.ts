import { describe, expect, it, vi } from 'vitest'
import { createAppsScriptBackend, toSheetsError } from './appsScriptBackend'
import { SheetsError } from './sheetsClient'

describe('createAppsScriptBackend', () => {
  it('서버 함수에 범위를 넘기고 범위 순서대로 값을 돌려준다', async () => {
    const call = vi.fn(async () => [[[1]]])
    const backend = createAppsScriptBackend(call)
    expect(await backend.batchGetValues(['a', 'b'])).toEqual([[[1]], []])
    expect(call).toHaveBeenCalledWith('batchGetValues', ['a', 'b'])
  })

  it('없는 탭은 null', async () => {
    const backend = createAppsScriptBackend(async () => null)
    expect(await backend.getSheetId('없는 탭')).toBeNull()
  })

  it('서버 오류를 종류별로 구분한다', async () => {
    const backend = createAppsScriptBackend(async () => {
      throw new Error('[notFound] "시트9" 탭을 찾을 수 없습니다.')
    })
    await expect(backend.batchUpdate([])).rejects.toMatchObject({ kind: 'notFound', message: '"시트9" 탭을 찾을 수 없습니다.' })
  })
})

describe('ocrReceipt', () => {
  it('사진을 base64와 형식으로 넘기고 Drive 인식 글자를 돌려준다', async () => {
    const call = vi.fn(async () => ({ engine: 'drive', text: '단가 1,689', tempFileLeft: false, gemini: 'no-key' }))
    const backend = createAppsScriptBackend(call)
    expect(await backend.ocrReceipt({ base64: 'AAAA', mimeType: 'image/jpeg' })).toEqual({
      engine: 'drive',
      fields: null,
      text: '단가 1,689',
      fallback: 'no-key',
      tempFileLeft: false,
    })
    expect(call).toHaveBeenCalledWith('ocrReceipt', 'AAAA', 'image/jpeg')
  })

  it('Gemini가 읽은 값을 돌려준다', async () => {
    const fields = { date: '2026-10-25', unitPrice: 1809, liters: 16, paid: 28944 }
    const backend = createAppsScriptBackend(async () => ({ engine: 'gemini', fields, text: '', tempFileLeft: false }))
    expect(await backend.ocrReceipt({ base64: 'AAAA', mimeType: 'image/jpeg' })).toEqual({ engine: 'gemini', fields, text: '', fallback: null, tempFileLeft: false })
  })

  it('이전 서버(엔진 표시 없음)나 비어 있는 응답은 Drive 인식으로 본다', async () => {
    expect(await createAppsScriptBackend(async () => ({ text: '글자', tempFileLeft: false })).ocrReceipt({ base64: 'AAAA', mimeType: 'image/png' })).toEqual({
      engine: 'drive',
      fields: null,
      text: '글자',
      fallback: null,
      tempFileLeft: false,
    })
    expect(await createAppsScriptBackend(async () => null).ocrReceipt({ base64: 'AAAA', mimeType: 'image/png' })).toMatchObject({ engine: 'drive', text: '' })
  })
})

describe('toSheetsError', () => {
  it.each([
    ['NetworkError: Connection failure due to HTTP 0', 'network'],
    ['Authorization is required to perform that action.', 'auth'],
    ['Error: [access] 허용하지 않는 요청입니다.', 'access'],
    ['Exception: Unable to parse range', 'api'],
  ] as const)('%s → %s', (message, kind) => {
    const error = toSheetsError(new Error(message))
    expect(error).toBeInstanceOf(SheetsError)
    expect(error.kind).toBe(kind)
  })
})
