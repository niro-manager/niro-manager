import { parseDate, type CellValue } from './cells'
import { FUEL_FIRST_ROW } from './fuel'
import type { FuelRecord } from './types'

// 주유 입력 검증과 시트 쓰기 계획(2026-10-10 합의).

export interface FuelInput {
  date: string
  unitPrice: number | null
  liters: number | null
  /** 결제액이 단가×리터와 다를 때만 값이 있다. null이면 E열에 수식을 쓴다 */
  manualCost: number | null
  odometerKm: number | null
  memo: string | null
}

export interface FuelForm {
  date: string
  unitPrice: string
  liters: string
  manualCostEnabled: boolean
  manualCost: string
  odometerKm: string
  memo: string
}

export type FuelInputResult = { ok: true; input: FuelInput } | { ok: false; errors: Partial<Record<keyof FuelForm, string>> }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30)
const DAY_MS = 24 * 60 * 60 * 1000

function parsePositive(text: string): number | null | 'invalid' {
  const trimmed = text.replace(/[,\s원₩]/g, '')
  if (trimmed === '') return null
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'invalid'
  const value = Number(trimmed)
  return value > 0 ? value : 'invalid'
}

export function validateFuelForm(form: FuelForm): FuelInputResult {
  const errors: Partial<Record<keyof FuelForm, string>> = {}
  const date = parseDate(form.date)
  if (!ISO_DATE.test(form.date) || !date.ok || date.value === null) errors.date = '날짜를 입력해 주세요.'

  const unitPrice = parsePositive(form.unitPrice)
  const liters = parsePositive(form.liters)
  const manualCost = form.manualCostEnabled ? parsePositive(form.manualCost) : null
  const odometerKm = parsePositive(form.odometerKm)
  if (unitPrice === 'invalid') errors.unitPrice = '0보다 큰 숫자를 입력해 주세요.'
  if (liters === 'invalid') errors.liters = '0보다 큰 숫자를 입력해 주세요.'
  else if (typeof liters === 'number' && !/^\d+(\.\d{1,3})?$/.test(String(liters))) errors.liters = '소수점 아래 3자리까지 입력할 수 있습니다.'
  if (manualCost === 'invalid') errors.manualCost = '0보다 큰 금액을 입력해 주세요.'
  if (odometerKm === 'invalid') errors.odometerKm = '0보다 큰 숫자를 입력해 주세요.'

  if (form.manualCostEnabled && manualCost === null) errors.manualCost = '결제 금액을 입력해 주세요.'
  if (!form.manualCostEnabled && !errors.unitPrice && !errors.liters && (unitPrice === null || liters === null)) {
    errors.unitPrice = '단가와 리터를 모두 입력하거나, 결제 금액을 직접 입력해 주세요.'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  const memo = form.memo.trim()
  return {
    ok: true,
    input: {
      date: form.date,
      unitPrice: unitPrice as number | null,
      liters: liters as number | null,
      manualCost: manualCost as number | null,
      odometerKm: odometerKm as number | null,
      memo: memo === '' ? null : memo,
    },
  }
}

/** E열에 기록될 주유비 */
export function expectedCost(input: FuelInput): number | null {
  if (input.manualCost !== null) return input.manualCost
  return input.unitPrice !== null && input.liters !== null ? input.unitPrice * input.liters : null
}

/** `yyyy-mm-dd` → Sheets 날짜 직렬값 */
export function isoToSerial(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(y, m - 1, d) - SHEETS_EPOCH_UTC_MS) / DAY_MS)
}

export interface FuelPlacement {
  /** 새 기록이 들어갈 시트 행 번호(1부터) */
  row: number
  mode: 'append' | 'insert'
}

/**
 * 새 기록의 위치를 정한다.
 * - 날짜가 마지막 기록과 같거나 이후면, 시트1 A:I에 값이 있는 마지막 행 바로 아래에 추가한다.
 * - 과거 날짜면 그 날짜보다 늦은 첫 기록 행에 끼워 넣는다(같은 날짜 기록들의 뒤).
 * @param rows 시트1 A2:I 값(빈 행 포함, 끝의 빈 행은 API가 잘라냄)
 */
export function placeFuelRecord(records: FuelRecord[], rows: CellValue[][], date: string): FuelPlacement {
  const appendRow = FUEL_FIRST_ROW + rows.length
  const latest = records.reduce<string | null>((acc, r) => (acc === null || r.date > acc ? r.date : acc), null)
  if (latest === null || date >= latest) return { row: appendRow, mode: 'append' }
  const next = records.find((r) => r.date > date)
  return next ? { row: next.sheetRow, mode: 'insert' } : { row: appendRow, mode: 'append' }
}

/** 시트1의 기록이 날짜 순서대로인지 확인한다. 순서가 섞여 있으면 끼워 넣을 위치를 믿을 수 없다. */
export function isSortedByDate(records: FuelRecord[]): boolean {
  return records.every((r, i) => i === 0 || records[i - 1]!.date <= r.date)
}

/** 같은 내용의 기록이 이미 있는지(재시도·두 번 누름으로 인한 중복 의심) */
export function findDuplicate(records: FuelRecord[], input: FuelInput): FuelRecord | undefined {
  const cost = expectedCost(input)
  return records.find(
    (r) =>
      r.date === input.date &&
      r.unitPrice === input.unitPrice &&
      r.liters === input.liters &&
      r.odometerKm === input.odometerKm &&
      (r.cost === null || cost === null ? r.cost === cost : Math.abs(r.cost - cost) < 0.005),
  )
}
