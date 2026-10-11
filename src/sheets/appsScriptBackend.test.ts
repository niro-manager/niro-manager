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
