import { describe, expect, it } from 'vitest'
import { parseMaintenanceRows } from './maintenance'

// 테스트 값은 실제 차계부가 아닌 임의 값이다.
describe('parseMaintenanceRows', () => {
  it('날짜 행과 이어지는 항목 행을 정비 1건으로 묶는다', () => {
    const { records, warnings } = parseMaintenanceRows([
      [45469, '엔진오일 교체', '업체A', 9000, 0],
      ['', '와이퍼 교체'],
      ['', '필터 교체'],
      [45663, '타이어 교체', '업체B', 20000],
      [45700, '점검'],
    ])
    expect(warnings).toEqual([])
    expect(records).toEqual([
      { sheetRow: 1, date: '2024-06-26', items: ['엔진오일 교체', '와이퍼 교체', '필터 교체'], vendor: '업체A', odometerKm: 9000, cost: 0 },
      { sheetRow: 4, date: '2025-01-06', items: ['타이어 교체'], vendor: '업체B', odometerKm: 20000, cost: null },
      { sheetRow: 5, date: '2025-02-12', items: ['점검'], vendor: null, odometerKm: null, cost: null },
    ])
  })

  it('금액 0(무료)과 빈 칸(미입력)을 구분한다', () => {
    const { records } = parseMaintenanceRows([
      [45469, '가', '', '', 0],
      [45470, '나', '', '', ''],
    ])
    expect(records.map((r) => r.cost)).toEqual([0, null])
  })

  it('첫 정비보다 앞선 항목 행은 경고한다', () => {
    const { records, warnings } = parseMaintenanceRows([['', '고아 항목'], [45469, '가']])
    expect(records).toHaveLength(1)
    expect(warnings).toEqual([{ sheetRow: 1, message: '날짜가 있는 정비 행보다 앞에 있어 제외했습니다.' }])
  })

  it('빈 행은 건너뛴다', () => {
    const { records } = parseMaintenanceRows([[45469, '가'], [], ['', '나']])
    expect(records[0]?.items).toEqual(['가', '나'])
  })
})
