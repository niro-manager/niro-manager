import { parseDate, parseNumber, parseText, type CellValue } from './cells'
import type { FuelRecord, ParseResult, RowWarning } from './types'

/** 시트1 읽기 범위. 1행은 헤더이므로 2행부터 A~I열을 읽는다. */
export const FUEL_FIRST_ROW = 2
export const FUEL_COLUMNS = 'A:I'

// 열 위치(0부터): A 날짜, B 요일(수식), C 단가, D 리터, E 주유비, F 경과일수(수식), G 누적 km, H 비고, I 비고
const COL = { date: 0, unitPrice: 2, liters: 3, cost: 4, odometer: 6, memoH: 7, memoI: 8 } as const

const NUMBER_FIELDS = [
  ['unitPrice', COL.unitPrice, '단가'],
  ['liters', COL.liters, '리터'],
  ['cost', COL.cost, '주유비'],
  ['odometerKm', COL.odometer, '누적 키로수'],
] as const

/** 시트1 값(2행부터)을 주유 기록으로 바꾼다. 빈 행은 건너뛰고, 해석할 수 없는 값은 경고로 남긴다. */
export function parseFuelRows(rows: CellValue[][], firstRow = FUEL_FIRST_ROW): ParseResult<FuelRecord> {
  const records: FuelRecord[] = []
  const warnings: RowWarning[] = []

  rows.forEach((row, index) => {
    const sheetRow = firstRow + index
    const cells = (col: number): CellValue => row[col]
    if ([COL.date, COL.unitPrice, COL.liters, COL.cost, COL.odometer, COL.memoH, COL.memoI].every((col) => parseText(cells(col)) === null)) {
      return
    }

    const date = parseDate(cells(COL.date))
    if (!date.ok || date.value === null) {
      warnings.push({ sheetRow, message: date.ok ? '날짜가 비어 있어 제외했습니다.' : `날짜를 해석할 수 없어 제외했습니다: ${String(date.raw)}` })
      return
    }

    const record: FuelRecord = {
      sheetRow,
      date: date.value,
      unitPrice: null,
      liters: null,
      cost: null,
      odometerKm: null,
      memo: joinMemo(parseText(cells(COL.memoH)), parseText(cells(COL.memoI))),
    }
    for (const [field, col, label] of NUMBER_FIELDS) {
      const parsed = parseNumber(cells(col))
      if (parsed.ok) {
        record[field] = parsed.value
      } else {
        warnings.push({ sheetRow, message: `${label} 값을 해석할 수 없어 비워 두었습니다: ${String(parsed.raw)}` })
      }
    }
    records.push(record)
  })

  return { records, warnings }
}

/** H열과 I열은 같은 비고다. 둘 다 있으면 H, I 순서로 잇는다. */
function joinMemo(h: string | null, i: string | null): string | null {
  if (h && i) return `${h} / ${i}`
  return h ?? i
}
