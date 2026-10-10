import { describe, expect, it } from 'vitest'
import { parseFuelRows } from './fuel'

// 테스트 값은 실제 차계부가 아닌 임의 값이다.
describe('parseFuelRows', () => {
  it('열을 매핑하고 빈 값은 null로 둔다', () => {
    const { records, warnings } = parseFuelRows([
      [45303, '금', 1500, 16, 24000, '', 1000, '', ''],
      [45310, '금', '', 20, 30000, 7, '', '', '메모'],
    ])
    expect(warnings).toEqual([])
    expect(records).toEqual([
      { sheetRow: 2, date: '2024-01-12', unitPrice: 1500, liters: 16, cost: 24000, odometerKm: 1000, memo: null },
      { sheetRow: 3, date: '2024-01-19', unitPrice: null, liters: 20, cost: 30000, odometerKm: null, memo: '메모' },
    ])
  })

  it('H열과 I열 비고를 합친다', () => {
    const { records } = parseFuelRows([
      [45303, '금', 1500, 16, 24000, '', '', '가', ''],
      [45304, '토', 1500, 16, 24000, 1, '', '나', '다'],
    ])
    expect(records.map((r) => r.memo)).toEqual(['가', '나 / 다'])
  })

  it('짧은 행(뒤쪽 빈 열 생략)을 처리한다', () => {
    const { records } = parseFuelRows([[45303, '금', 1500, 16, 24000]])
    expect(records[0]).toMatchObject({ odometerKm: null, memo: null })
  })

  it('빈 행은 건너뛰고 행 번호는 유지한다', () => {
    const { records } = parseFuelRows([[], ['', '', '', '', ''], [45303, '금', 1500, 16, 24000]])
    expect(records.map((r) => r.sheetRow)).toEqual([4])
  })

  it('같은 날 여러 건을 모두 유지한다', () => {
    const { records } = parseFuelRows([
      [45303, '금', 1500, 4, 6000],
      [45303, '금', 1490, 14, 20860],
    ])
    expect(records).toHaveLength(2)
  })

  it('날짜가 없거나 값을 해석할 수 없으면 경고한다', () => {
    const { records, warnings } = parseFuelRows([
      ['', '', 1500, 16, 24000],
      [45303, '금', '모름', 16, 24000],
    ])
    expect(records).toHaveLength(1)
    expect(records[0]?.unitPrice).toBeNull()
    expect(warnings.map((w) => w.sheetRow)).toEqual([2, 3])
  })
})
