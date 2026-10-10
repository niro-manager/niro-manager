import { describe, expect, it } from 'vitest'
import { parseFuelRows } from './fuel'
import { expectedCost, findDuplicate, isSortedByDate, isoToSerial, placeFuelRecord, validateFuelForm, type FuelForm } from './fuelInput'

// 테스트 값은 실제 차계부가 아닌 임의 값이다.
const FORM: FuelForm = { date: '2026-10-12', unitPrice: '1,809', liters: '16', manualCostEnabled: false, manualCost: '', odometerKm: '', memo: ' ' }

describe('validateFuelForm', () => {
  it('정상 입력', () => {
    expect(validateFuelForm(FORM)).toEqual({
      ok: true,
      input: { date: '2026-10-12', unitPrice: 1809, liters: 16, manualCost: null, odometerKm: null, memo: null },
    })
  })
  it('단가·리터가 없으면 결제 금액 직접 입력을 요구한다', () => {
    const result = validateFuelForm({ ...FORM, unitPrice: '' })
    expect(result.ok).toBe(false)
    expect(validateFuelForm({ ...FORM, unitPrice: '', manualCostEnabled: true, manualCost: '50000' }).ok).toBe(true)
  })
  it('직접 입력을 켰으면 금액이 있어야 한다', () => {
    expect(validateFuelForm({ ...FORM, manualCostEnabled: true }).ok).toBe(false)
  })
  it('잘못된 값', () => {
    const result = validateFuelForm({ ...FORM, date: '2026-02-30', liters: '0', odometerKm: 'abc' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['date', 'liters', 'odometerKm'])
    expect(validateFuelForm({ ...FORM, liters: '31.7465' }).ok).toBe(false)
  })
})

describe('expectedCost / isoToSerial', () => {
  it('직접 입력 금액이 우선', () => {
    expect(expectedCost({ date: '', unitPrice: 1974, liters: 25, manualCost: 50000, odometerKm: null, memo: null })).toBe(50000)
    expect(expectedCost({ date: '', unitPrice: 1974, liters: 25, manualCost: null, odometerKm: null, memo: null })).toBe(49350)
  })
  it('날짜 직렬값', () => {
    expect(isoToSerial('2024-01-12')).toBe(45303)
    expect(isoToSerial('1899-12-31')).toBe(1)
  })
})

describe('placeFuelRecord', () => {
  // 2행 01-10, 3행 01-15, 4행 01-15, 5행 01-20
  const rows = [
    [isoToSerial('2026-01-10'), '', 1500, 16],
    [isoToSerial('2026-01-15'), '', 1500, 16],
    [isoToSerial('2026-01-15'), '', 1500, 4],
    [isoToSerial('2026-01-20'), '', 1500, 16],
  ]
  const { records } = parseFuelRows(rows)

  it('최신 날짜 이후(같은 날 포함)는 마지막 행 아래에 추가', () => {
    expect(placeFuelRecord(records, rows, '2026-01-25')).toEqual({ row: 6, mode: 'append' })
    expect(placeFuelRecord(records, rows, '2026-01-20')).toEqual({ row: 6, mode: 'append' })
  })
  it('과거 날짜는 같은 날짜 기록들 뒤에 끼워 넣는다', () => {
    expect(placeFuelRecord(records, rows, '2026-01-15')).toEqual({ row: 5, mode: 'insert' })
    expect(placeFuelRecord(records, rows, '2026-01-12')).toEqual({ row: 3, mode: 'insert' })
  })
  it('가장 이른 날짜면 첫 기록 행(2행)에 끼워 넣는다', () => {
    expect(placeFuelRecord(records, rows, '2025-12-31')).toEqual({ row: 2, mode: 'insert' })
  })
  it('날짜 없는 행이 끝에 있으면 그 아래에 추가한다', () => {
    const withTrailing = [...rows, ['', '', '', '', '', '', '', '', '메모만']]
    expect(placeFuelRecord(records, withTrailing, '2026-02-01')).toEqual({ row: 7, mode: 'append' })
  })
  it('기록이 없으면 2행', () => {
    expect(placeFuelRecord([], [], '2026-01-01')).toEqual({ row: 2, mode: 'append' })
  })
})

describe('isSortedByDate / findDuplicate', () => {
  const { records } = parseFuelRows([
    [isoToSerial('2026-01-10'), '', 1500, 16, 24000],
    [isoToSerial('2026-01-05'), '', 1500, 16, 24000],
  ])
  it('순서 확인', () => {
    expect(isSortedByDate(records)).toBe(false)
    expect(isSortedByDate(records.slice(0, 1))).toBe(true)
  })
  it('같은 내용 기록을 찾는다', () => {
    const input = { date: '2026-01-10', unitPrice: 1500, liters: 16, manualCost: null, odometerKm: null, memo: null }
    expect(findDuplicate(records, input)?.sheetRow).toBe(2)
    expect(findDuplicate(records, { ...input, liters: 15 })).toBeUndefined()
  })
})
