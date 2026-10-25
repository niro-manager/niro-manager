import { describe, expect, it, vi } from 'vitest'
import { readLogbook } from './readLogbook'
import { quoteSheetName, targetOf, type SheetsBackend } from './sheetsClient'

describe('quoteSheetName', () => {
  it('탭 이름을 따옴표로 감싸고 작은따옴표를 이스케이프한다', () => {
    expect(quoteSheetName('시트1')).toBe("'시트1'")
    expect(quoteSheetName("it's")).toBe("'it''s'")
  })
})

describe('targetOf', () => {
  it('이름에 "복사본"이 있으면 테스트용 복사본', () => {
    expect(targetOf('차계부 (테스트 복사본)')).toBe('copy')
    expect(targetOf('차계부')).toBe('original')
  })
})

describe('readLogbook', () => {
  it('두 탭을 한 번에 읽어 기록으로 바꾼다', async () => {
    const batchGetValues = vi.fn(async (_ranges: string[]) => [[[45303, '금', 1500, 16, 24000]], [[45469, '점검', '업체', 9000, 0], ['', '추가 항목']]])
    const backend: SheetsBackend = { getInfo: async () => ({ name: '차계부' }), getSheetId: async () => 0, batchUpdate: async () => undefined, ocrReceipt: async () => ({ engine: 'drive', fields: null, text: '', fallback: null, tempFileLeft: false }), batchGetValues }
    const logbook = await readLogbook({ backend, spreadsheetName: '차계부', fuelSheetName: '시트1', maintenanceSheetName: '시트2' })
    expect(batchGetValues).toHaveBeenCalledWith(["'시트1'!A2:I", "'시트2'!A1:E"])
    expect(logbook.fuel).toHaveLength(1)
    expect(logbook.fuel[0]?.sheetRow).toBe(2)
    expect(logbook.maintenance[0]?.items).toEqual(['점검', '추가 항목'])
  })
})
