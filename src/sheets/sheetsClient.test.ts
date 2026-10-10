import { describe, expect, it, vi } from 'vitest'
import { SheetsError, batchGetValues, buildBatchGetUrl, quoteSheetName } from './sheetsClient'
import { readLogbook } from './readLogbook'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('quoteSheetName / buildBatchGetUrl', () => {
  it('탭 이름을 따옴표로 감싸고 작은따옴표를 이스케이프한다', () => {
    expect(quoteSheetName('시트1')).toBe("'시트1'")
    expect(quoteSheetName("it's")).toBe("'it''s'")
  })
  it('값을 계산 결과 숫자와 날짜 직렬값으로 요청한다', () => {
    const url = new URL(buildBatchGetUrl('ID123', ["'시트1'!A2:I"]))
    expect(url.pathname).toBe('/v4/spreadsheets/ID123/values:batchGet')
    expect(url.searchParams.get('valueRenderOption')).toBe('UNFORMATTED_VALUE')
    expect(url.searchParams.get('dateTimeRenderOption')).toBe('SERIAL_NUMBER')
    expect(url.searchParams.getAll('ranges')).toEqual(["'시트1'!A2:I"])
  })
})

describe('batchGetValues', () => {
  it('Bearer 토큰으로 요청하고 범위 순서대로 값을 돌려준다', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { valueRanges: [{ values: [[1]] }, {}] }))
    const result = await batchGetValues('TOKEN', 'ID', ['a', 'b'], fetchImpl)
    expect(result).toEqual([[[1]], []])
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual({ method: 'GET', headers: { Authorization: 'Bearer TOKEN' } })
  })

  it.each([
    [401, 'auth'],
    [403, 'access'],
    [404, 'notFound'],
    [400, 'api'],
    [500, 'api'],
  ] as const)('HTTP %i는 %s 오류로 구분한다', async (status, kind) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status, { error: { message: 'detail' } }))
    const error = await batchGetValues('T', 'ID', ['a'], fetchImpl).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SheetsError)
    expect((error as SheetsError).kind).toBe(kind)
  })

  it('네트워크 실패를 구분한다', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(batchGetValues('T', 'ID', ['a'], fetchImpl)).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('readLogbook', () => {
  it('두 탭을 한 번에 읽어 기록으로 바꾼다', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, {
        valueRanges: [{ values: [[45303, '금', 1500, 16, 24000]] }, { values: [[45469, '점검', '업체', 9000, 0], ['', '추가 항목']] }],
      }),
    )
    const logbook = await readLogbook('T', { spreadsheetId: 'ID', fuelSheetName: '시트1', maintenanceSheetName: '시트2' }, fetchImpl)
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]))
    expect(url.searchParams.getAll('ranges')).toEqual(["'시트1'!A2:I", "'시트2'!A1:E"])
    expect(logbook.fuel).toHaveLength(1)
    expect(logbook.fuel[0]?.sheetRow).toBe(2)
    expect(logbook.maintenance[0]?.items).toEqual(['점검', '추가 항목'])
  })
})
