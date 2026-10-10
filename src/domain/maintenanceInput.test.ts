import { describe, expect, it } from 'vitest'
import { isoToSerial } from './fuelInput'
import { parseMaintenanceRows } from './maintenance'
import { findMaintenanceDuplicate, maintenanceRows, placeMaintenanceRecord, validateMaintenanceForm, type MaintenanceForm } from './maintenanceInput'

// 테스트 값은 실제 차계부가 아닌 임의 값이다.
const FORM: MaintenanceForm = { date: '2026-10-09', items: [' 타이어 교체 ', '', '휠 얼라인먼트'], vendor: '', odometerKm: '58,300', cost: '0' }

describe('validateMaintenanceForm', () => {
  it('빈 항목을 빼고, 금액 0(무료)을 허용한다', () => {
    expect(validateMaintenanceForm(FORM)).toEqual({
      ok: true,
      input: { date: '2026-10-09', items: ['타이어 교체', '휠 얼라인먼트'], vendor: null, odometerKm: 58300, cost: 0 },
    })
  })
  it('금액을 비우면 미입력(null)', () => {
    const result = validateMaintenanceForm({ ...FORM, cost: '' })
    expect(result.ok && result.input.cost).toBeNull()
  })
  it('항목이 없거나 값이 잘못되면 오류', () => {
    const result = validateMaintenanceForm({ ...FORM, items: [' '], odometerKm: '0', cost: '-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['cost', 'items', 'odometerKm'])
  })
})

describe('placeMaintenanceRecord', () => {
  const rows = [
    [isoToSerial('2024-06-26'), '오일', '업체A', 9300],
    ['', '와이퍼'],
    [isoToSerial('2025-01-06'), '오일', '업체A', 22500],
    ['', '와이퍼'],
    [isoToSerial('2026-10-09'), '타이어'],
  ]
  const { records } = parseMaintenanceRows(rows)
  it('최신 날짜는 마지막 행 아래', () => {
    expect(placeMaintenanceRecord(records, rows, '2026-10-09')).toEqual({ row: 6, mode: 'append' })
  })
  it('과거 날짜는 다음 정비 묶음 앞', () => {
    expect(placeMaintenanceRecord(records, rows, '2025-01-01')).toEqual({ row: 3, mode: 'insert' })
    expect(placeMaintenanceRecord(records, rows, '2024-01-01')).toEqual({ row: 1, mode: 'insert' })
  })
  it('같은 내용 정비를 찾는다', () => {
    const input = { date: '2025-01-06', items: ['오일', '와이퍼'], vendor: '업체A', odometerKm: 22500, cost: null }
    expect(findMaintenanceDuplicate(records, input)?.sheetRow).toBe(3)
    expect(findMaintenanceDuplicate(records, { ...input, items: ['오일'] })).toBeUndefined()
  })
})

describe('maintenanceRows', () => {
  it('첫 행에만 날짜·업체·km·금액', () => {
    expect(maintenanceRows({ date: '2024-01-12', items: ['가', '나'], vendor: '업체', odometerKm: 100, cost: 0 })).toEqual([
      [45303, '가', '업체', 100, 0],
      [null, '나', null, null, null],
    ])
  })
})
