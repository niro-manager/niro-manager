import type { FuelRecord, MaintenanceRecord } from './types'

// 월별 집계(2026-10-10 합의).
// - 월은 기록 날짜(시트의 날짜 그대로)의 yyyy-mm 이다.
// - 합계는 값이 있는 행만 더하고, 값이 빠진 행 수를 따로 센다. 빠진 값을 0으로 보지 않는다.
// - 주유 단가는 리터 가중 평균 Σ(단가×리터) ÷ Σ리터 이다. 단가와 리터가 모두 있는 행만 쓴다.
// - 기록이 없는 달도 첫 달~마지막 달 사이에 채워 넣는다(주유비·주유량·정비비 0, 단가 없음).

export interface MonthlySummary {
  month: string
  fuelCount: number
  /** 주유비 합계(원) */
  fuelCost: number
  fuelCostMissing: number
  /** 주유량 합계(리터) */
  liters: number
  litersMissing: number
  /** 리터 가중 평균 단가(원/리터). 계산할 행이 없으면 null */
  unitPrice: number | null
  /** 단가 계산에 쓴 행 수 */
  unitPriceRows: number
  maintenanceCount: number
  /** 정비비 합계(원). 금액이 입력된 정비만 더한다 */
  maintenanceCost: number
  /** 금액이 미입력인 정비 수 */
  maintenanceCostMissing: number
}

interface Accumulator extends MonthlySummary {
  weightedPriceSum: number
  weightedLiters: number
}

function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/** from부터 to까지(포함) yyyy-mm 목록 */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = []
  let [year, month] = from.split('-').map(Number) as [number, number]
  const [endYear, endMonth] = to.split('-').map(Number) as [number, number]
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

function empty(month: string): Accumulator {
  return {
    month,
    fuelCount: 0,
    fuelCost: 0,
    fuelCostMissing: 0,
    liters: 0,
    litersMissing: 0,
    unitPrice: null,
    unitPriceRows: 0,
    maintenanceCount: 0,
    maintenanceCost: 0,
    maintenanceCostMissing: 0,
    weightedPriceSum: 0,
    weightedLiters: 0,
  }
}

/** 주유·정비 기록을 월별로 집계한다. 결과는 오래된 달부터 정렬된다. */
export function summarizeMonthly(fuel: FuelRecord[], maintenance: MaintenanceRecord[]): MonthlySummary[] {
  const dates = [...fuel.map((r) => r.date), ...maintenance.map((r) => r.date)].sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first === undefined || last === undefined) return []

  const byMonth = new Map(monthRange(monthOf(first), monthOf(last)).map((m) => [m, empty(m)]))
  const at = (date: string) => byMonth.get(monthOf(date))!

  for (const r of fuel) {
    const m = at(r.date)
    m.fuelCount += 1
    if (r.cost === null) m.fuelCostMissing += 1
    else m.fuelCost += r.cost
    if (r.liters === null) m.litersMissing += 1
    else m.liters += r.liters
    if (r.unitPrice !== null && r.liters !== null && r.liters > 0) {
      m.weightedPriceSum += r.unitPrice * r.liters
      m.weightedLiters += r.liters
      m.unitPriceRows += 1
    }
  }

  for (const r of maintenance) {
    const m = at(r.date)
    m.maintenanceCount += 1
    if (r.cost === null) m.maintenanceCostMissing += 1
    else m.maintenanceCost += r.cost
  }

  return [...byMonth.values()].map(({ weightedPriceSum, weightedLiters, ...summary }) => ({
    ...summary,
    unitPrice: weightedLiters > 0 ? weightedPriceSum / weightedLiters : null,
  }))
}
