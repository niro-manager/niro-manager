import { parseDate, type CellValue } from './cells'
import { isoToSerial } from './fuelInput'
import { MAINTENANCE_FIRST_ROW } from './maintenance'
import type { MaintenanceRecord } from './types'

// 정비 입력 검증과 시트 쓰기 위치(2026-10-10 합의).

export interface MaintenanceInput {
  date: string
  items: string[]
  vendor: string | null
  odometerKm: number | null
  /** 정비 1건 총액. null = 미입력, 0 = 무료 */
  cost: number | null
}

export interface MaintenanceForm {
  date: string
  items: string[]
  vendor: string
  odometerKm: string
  cost: string
}

export type MaintenanceInputResult = { ok: true; input: MaintenanceInput } | { ok: false; errors: Partial<Record<keyof MaintenanceForm, string>> }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseNumber(text: string, allowZero: boolean): number | null | 'invalid' {
  const trimmed = text.replace(/[,\s원₩]/g, '')
  if (trimmed === '') return null
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'invalid'
  const value = Number(trimmed)
  return value > 0 || (allowZero && value === 0) ? value : 'invalid'
}

export function validateMaintenanceForm(form: MaintenanceForm): MaintenanceInputResult {
  const errors: Partial<Record<keyof MaintenanceForm, string>> = {}
  const date = parseDate(form.date)
  if (!ISO_DATE.test(form.date) || !date.ok || date.value === null) errors.date = '날짜를 입력해 주세요.'
  const items = form.items.map((item) => item.trim()).filter((item) => item !== '')
  if (items.length === 0) errors.items = '정비 항목을 하나 이상 입력해 주세요.'
  const odometerKm = parseNumber(form.odometerKm, false)
  if (odometerKm === 'invalid') errors.odometerKm = '0보다 큰 숫자를 입력해 주세요.'
  const cost = parseNumber(form.cost, true)
  if (cost === 'invalid') errors.cost = '0 이상의 금액을 입력해 주세요. 무료면 0, 모르면 비워 두세요.'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  const vendor = form.vendor.trim()
  return {
    ok: true,
    input: { date: form.date, items, vendor: vendor === '' ? null : vendor, odometerKm: odometerKm as number | null, cost: cost as number | null },
  }
}

export interface MaintenancePlacement {
  /** 정비 첫 행이 들어갈 시트 행 번호(1부터) */
  row: number
  mode: 'append' | 'insert'
}

/**
 * 정비 묶음의 위치를 정한다. 최신 날짜(같은 날 포함)면 시트2 A:E에 값이 있는 마지막 행 아래,
 * 과거 날짜면 그 날짜보다 늦은 첫 정비 묶음의 첫 행 앞.
 * @param rows 시트2 A1:E 값
 */
export function placeMaintenanceRecord(records: MaintenanceRecord[], rows: CellValue[][], date: string): MaintenancePlacement {
  const appendRow = MAINTENANCE_FIRST_ROW + rows.length
  const next = records.find((r) => r.date > date)
  return next ? { row: next.sheetRow, mode: 'insert' } : { row: appendRow, mode: 'append' }
}

export function isMaintenanceSorted(records: MaintenanceRecord[]): boolean {
  return records.every((r, i) => i === 0 || records[i - 1]!.date <= r.date)
}

export function findMaintenanceDuplicate(records: MaintenanceRecord[], input: MaintenanceInput): MaintenanceRecord | undefined {
  return records.find(
    (r) =>
      r.date === input.date &&
      r.vendor === input.vendor &&
      r.odometerKm === input.odometerKm &&
      r.cost === input.cost &&
      r.items.length === input.items.length &&
      r.items.every((item, i) => item === input.items[i]),
  )
}

/** 시트에 쓸 행들(A:E). 첫 행에만 날짜·업체·km·금액을 둔다. */
export function maintenanceRows(input: MaintenanceInput): (number | string | null)[][] {
  return input.items.map((item, i) =>
    i === 0 ? [isoToSerial(input.date), item, input.vendor, input.odometerKm, input.cost] : [null, item, null, null, null],
  )
}
