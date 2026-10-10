// Sheets API 값(valueRenderOption=UNFORMATTED_VALUE, dateTimeRenderOption=SERIAL_NUMBER)을
// 도메인 값으로 바꾸는 공통 함수. 빈 셀은 0이 아니라 null로 둔다.

export type CellValue = string | number | boolean | null | undefined

export type Parsed<T> = { ok: true; value: T | null } | { ok: false; raw: CellValue }

// Google Sheets 날짜 직렬값의 기준일(1899-12-30)을 UTC 밀리초로 표현한 값
const SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30)
const DAY_MS = 24 * 60 * 60 * 1000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isBlank(cell: CellValue): boolean {
  return cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '')
}

/** 날짜 직렬값 또는 `yyyy-mm-dd` 문자열을 `yyyy-mm-dd`로 바꾼다. 시간대 영향을 받지 않도록 UTC로 계산한다. */
export function parseDate(cell: CellValue): Parsed<string> {
  if (isBlank(cell)) return { ok: true, value: null }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    const date = new Date(SHEETS_EPOCH_UTC_MS + Math.floor(cell) * DAY_MS)
    return { ok: true, value: date.toISOString().slice(0, 10) }
  }
  if (typeof cell === 'string') {
    const match = ISO_DATE.exec(cell.trim())
    if (match) {
      const [, y, m, d] = match
      const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
      if (date.toISOString().slice(0, 10) === cell.trim()) return { ok: true, value: cell.trim() }
    }
  }
  return { ok: false, raw: cell }
}

/** 숫자 셀을 number로 바꾼다. `₩1,507` 같은 표시 문자열도 허용한다. */
export function parseNumber(cell: CellValue): Parsed<number> {
  if (isBlank(cell)) return { ok: true, value: null }
  if (typeof cell === 'number') return Number.isFinite(cell) ? { ok: true, value: cell } : { ok: false, raw: cell }
  if (typeof cell === 'string') {
    const normalized = cell.replace(/[₩,\s]/g, '')
    if (/^-?\d+(\.\d+)?$/.test(normalized)) return { ok: true, value: Number(normalized) }
  }
  return { ok: false, raw: cell }
}

/** 텍스트 셀을 앞뒤 공백을 제거한 문자열로 바꾼다. 빈 셀은 null. */
export function parseText(cell: CellValue): string | null {
  if (isBlank(cell)) return null
  return String(cell).trim()
}
