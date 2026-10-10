import { parseDate, parseNumber, parseText, type CellValue } from './cells'
import type { MaintenanceRecord, ParseResult, RowWarning } from './types'

/** 시트2 읽기 범위. 헤더 없이 1행부터 A~E열을 읽는다. */
export const MAINTENANCE_FIRST_ROW = 1
export const MAINTENANCE_COLUMNS = 'A:E'

// 열 위치(0부터): A 날짜, B 항목, C 업체, D 누적 km, E 총액
const COL = { date: 0, item: 1, vendor: 2, odometer: 3, cost: 4 } as const

/**
 * 시트2 값을 정비 기록으로 바꾼다. 날짜가 있는 행이 정비 1건의 시작이고,
 * 날짜가 비어 있고 항목만 있는 다음 행들은 그 정비의 추가 항목이다.
 */
export function parseMaintenanceRows(rows: CellValue[][], firstRow = MAINTENANCE_FIRST_ROW): ParseResult<MaintenanceRecord> {
  const records: MaintenanceRecord[] = []
  const warnings: RowWarning[] = []
  let current = null as MaintenanceRecord | null

  rows.forEach((row, index) => {
    const sheetRow = firstRow + index
    const cells = (col: number): CellValue => row[col]
    const item = parseText(cells(COL.item))
    const date = parseDate(cells(COL.date))

    if (!date.ok) {
      warnings.push({ sheetRow, message: `날짜를 해석할 수 없어 제외했습니다: ${String(date.raw)}` })
      current = null
      return
    }

    if (date.value === null) {
      const hasOther = [COL.vendor, COL.odometer, COL.cost].some((col) => parseText(cells(col)) !== null)
      if (item === null && !hasOther) return
      if (current === null) {
        warnings.push({ sheetRow, message: '날짜가 있는 정비 행보다 앞에 있어 제외했습니다.' })
        return
      }
      if (item !== null) current.items.push(item)
      if (hasOther) warnings.push({ sheetRow, message: '이어지는 항목 행의 업체·km·금액은 읽지 않았습니다.' })
      return
    }

    const odometer = parseNumber(cells(COL.odometer))
    const cost = parseNumber(cells(COL.cost))
    if (!odometer.ok) warnings.push({ sheetRow, message: `누적 km 값을 해석할 수 없어 비워 두었습니다: ${String(odometer.raw)}` })
    if (!cost.ok) warnings.push({ sheetRow, message: `금액을 해석할 수 없어 비워 두었습니다: ${String(cost.raw)}` })

    const record: MaintenanceRecord = {
      sheetRow,
      date: date.value,
      items: item === null ? [] : [item],
      vendor: parseText(cells(COL.vendor)),
      odometerKm: odometer.ok ? odometer.value : null,
      cost: cost.ok ? cost.value : null,
    }
    records.push(record)
    current = record
  })

  return { records, warnings }
}
