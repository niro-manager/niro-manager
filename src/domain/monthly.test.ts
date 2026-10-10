import { describe, expect, it } from 'vitest'
import { monthRange, summarizeMonthly } from './monthly'
import type { FuelRecord, MaintenanceRecord } from './types'

// 테스트 값은 실제 차계부가 아닌 임의 값이다.
function fuel(date: string, unitPrice: number | null, liters: number | null, cost: number | null): FuelRecord {
  return { sheetRow: 0, date, unitPrice, liters, cost, odometerKm: null, memo: null }
}
function maint(date: string, cost: number | null): MaintenanceRecord {
  return { sheetRow: 0, date, items: ['점검'], vendor: null, odometerKm: null, cost }
}

describe('monthRange', () => {
  it('연도를 넘어 달을 채운다', () => {
    expect(monthRange('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02'])
    expect(monthRange('2025-03', '2025-03')).toEqual(['2025-03'])
  })
})

describe('summarizeMonthly', () => {
  it('기록이 없으면 빈 배열', () => {
    expect(summarizeMonthly([], [])).toEqual([])
  })

  it('주유 단가는 리터 가중 평균이다(단순 평균 아님)', () => {
    const [m] = summarizeMonthly([fuel('2025-01-03', 1500, 10, 15000), fuel('2025-01-20', 1800, 30, 54000)], [])
    // (1500×10 + 1800×30) ÷ 40 = 1725, 단순 평균이면 1650
    expect(m?.unitPrice).toBe(1725)
    expect(m?.unitPriceRows).toBe(2)
  })

  it('상품권 등으로 주유비가 단가×리터와 달라도 단가는 단가×리터 기준이다', () => {
    const [m] = summarizeMonthly([fuel('2025-01-03', 2000, 25, 50000), fuel('2025-01-10', 1900, 20, 40000)], [])
    expect(m?.fuelCost).toBe(90000)
    expect(m?.unitPrice).toBeCloseTo((2000 * 25 + 1900 * 20) / 45)
  })

  it('빠진 값은 0으로 더하지 않고 따로 센다', () => {
    const [m] = summarizeMonthly([fuel('2025-01-03', null, 16, 25000), fuel('2025-01-05', 1600, null, null)], [])
    expect(m).toMatchObject({ fuelCount: 2, fuelCost: 25000, fuelCostMissing: 1, liters: 16, litersMissing: 1, unitPrice: null, unitPriceRows: 0 })
  })

  it('기록 없는 달을 채우고, 정비 미입력과 무료(0)를 구분한다', () => {
    const result = summarizeMonthly([fuel('2025-01-03', 1500, 10, 15000)], [maint('2025-03-02', 0), maint('2025-03-20', null), maint('2025-03-25', 30000)])
    expect(result.map((m) => m.month)).toEqual(['2025-01', '2025-02', '2025-03'])
    expect(result[1]).toMatchObject({ fuelCount: 0, fuelCost: 0, liters: 0, unitPrice: null })
    expect(result[2]).toMatchObject({ maintenanceCount: 3, maintenanceCost: 30000, maintenanceCostMissing: 1 })
  })
})
