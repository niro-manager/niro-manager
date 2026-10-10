import type { CellValue } from '../domain/cells'
import { FUEL_FIRST_ROW, parseFuelRows } from '../domain/fuel'
import { expectedCost, findDuplicate, isSortedByDate, isoToSerial, placeFuelRecord, type FuelInput, type FuelPlacement } from '../domain/fuelInput'
import type { FuelRecord } from '../domain/types'
import type { Settings } from '../settings/settings'
import { SheetsError, batchGetValues, batchUpdate, getSheetId, quoteSheetName } from './sheetsClient'

// 주유 기록 쓰기(2단계). 쓰기 대상은 테스트용 복사본만 허용한다(원본 쓰기는 사용자 승인 전까지 비활성화).

/** 원본 쓰기 전환은 사용자 승인 후에만 true로 바꾼다(CLAUDE.md). */
export const ORIGINAL_WRITE_ENABLED = false
const COLUMN_COUNT = 9 // A~I

export type WriteGuard = { ok: true } | { ok: false; reason: string }

export function checkWriteAllowed(settings: Settings): WriteGuard {
  if (!settings.spreadsheetId) return { ok: false, reason: '설정에서 스프레드시트를 먼저 선택해 주세요.' }
  if (settings.target === 'original' && !ORIGINAL_WRITE_ENABLED) return { ok: false, reason: '원본 쓰기는 테스트용 복사본 검증과 사용자 승인 전까지 꺼져 있습니다.' }
  if (settings.target === 'copy' && !settings.spreadsheetName.includes('복사본')) {
    return { ok: false, reason: '테스트용 복사본으로 표시했지만 파일 이름에 "복사본"이 없습니다. 원본이 아닌지 확인해 주세요.' }
  }
  return { ok: true }
}

export interface FuelWritePlan {
  input: FuelInput
  placement: FuelPlacement
  sheetId: number
  /** 계획 시점의 A2:I 행 수. 저장 직전 다시 읽어 바뀌었으면 중단한다 */
  rowCount: number
  duplicate: FuelRecord | undefined
  /** 끼워 넣을 때 아래로 밀리는 기록 수 */
  shiftedRecords: number
}

function fuelRange(settings: Settings): string {
  return `${quoteSheetName(settings.fuelSheetName)}!A${FUEL_FIRST_ROW}:I`
}

async function readFuel(token: string, settings: Settings, fetchImpl?: typeof fetch) {
  const [rows = []] = await batchGetValues(token, settings.spreadsheetId, [fuelRange(settings)], fetchImpl)
  return { rows, records: parseFuelRows(rows).records }
}

/** 시트를 읽어 새 기록의 위치와 중복 여부를 계산한다. 시트에 쓰지 않는다. */
export async function planFuelWrite(token: string, settings: Settings, input: FuelInput, fetchImpl?: typeof fetch): Promise<FuelWritePlan> {
  const guard = checkWriteAllowed(settings)
  if (!guard.ok) throw new SheetsError('access', guard.reason)
  const sheetId = await getSheetId(token, settings.spreadsheetId, settings.fuelSheetName, fetchImpl)
  if (sheetId === null) throw new SheetsError('api', `"${settings.fuelSheetName}" 탭을 찾을 수 없습니다.`)
  const { rows, records } = await readFuel(token, settings, fetchImpl)
  const placement = placeFuelRecord(records, rows, input.date)
  if (placement.mode === 'insert' && !isSortedByDate(records)) {
    throw new SheetsError('api', '시트의 기록이 날짜 순서대로가 아니어서 끼워 넣을 위치를 정할 수 없습니다.')
  }
  return {
    input,
    placement,
    sheetId,
    rowCount: rows.length,
    duplicate: findDuplicate(records, input),
    shiftedRecords: placement.mode === 'insert' ? records.filter((r) => r.sheetRow >= placement.row).length : 0,
  }
}

type CellData = { userEnteredValue?: { numberValue?: number; stringValue?: string; formulaValue?: string } }
const num = (v: number | null): CellData => (v === null ? {} : { userEnteredValue: { numberValue: v } })
const formula = (f: string): CellData => ({ userEnteredValue: { formulaValue: f } })

/** 계획을 batchUpdate 요청 목록으로 바꾼다. 행·열 번호는 API 규칙대로 0부터 센다. */
export function buildFuelWriteRequests(plan: FuelWritePlan): unknown[] {
  const { input, placement, sheetId } = plan
  const r = placement.row
  const index = r - 1
  const rowRange = (rowIndex: number) => ({ sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: COLUMN_COUNT })
  const requests: unknown[] = []

  if (placement.mode === 'insert') {
    // J:K 요일 조회표가 밀리지 않도록 A:I만 아래로 민다.
    requests.push({ insertRange: { range: rowRange(index), shiftDimension: 'ROWS' } })
  }
  // 서식은 이웃 기록 행에서 복사한다(끼워 넣기: 밀려난 바로 아래 행, 추가: 바로 위 행).
  const formatSource = placement.mode === 'insert' ? index + 1 : index - 1
  if (formatSource >= FUEL_FIRST_ROW - 1) {
    requests.push({ copyPaste: { source: rowRange(formatSource), destination: rowRange(index), pasteType: 'PASTE_FORMAT' } })
  }

  const cost: CellData =
    input.manualCost !== null ? num(input.manualCost) : input.unitPrice !== null && input.liters !== null ? formula(`=C${r}*D${r}`) : {}
  const values: CellData[] = [
    num(isoToSerial(input.date)),
    formula(`=vlookup(weekday(A${r}),$J$2:$K$8,2,0)`),
    num(input.unitPrice),
    num(input.liters),
    cost,
    r > FUEL_FIRST_ROW ? formula(`=days(A${r},A${r - 1})`) : {},
    num(input.odometerKm),
    {},
    input.memo === null ? {} : { userEnteredValue: { stringValue: input.memo } },
  ]
  requests.push({ updateCells: { start: { sheetId, rowIndex: index, columnIndex: 0 }, rows: [{ values }], fields: 'userEnteredValue' } })

  if (placement.mode === 'insert') {
    // 밀려난 다음 기록의 경과일수를 새 기록 기준으로 다시 쓴다.
    requests.push({
      updateCells: { start: { sheetId, rowIndex: index + 1, columnIndex: 5 }, rows: [{ values: [formula(`=days(A${r + 1},A${r})`)] }], fields: 'userEnteredValue' },
    })
  }
  return requests
}

function same(actual: CellValue, expected: number | string | null): boolean {
  if (expected === null) return actual === undefined || actual === null || actual === ''
  if (typeof expected === 'number') return typeof actual === 'number' && Math.abs(actual - expected) < 0.005
  return actual === expected
}

/** 쓴 행을 다시 읽어 기대한 값과 비교한다. 다른 칸이 있으면 그 목록을 돌려준다. */
export function verifyFuelRows(plan: FuelWritePlan, rows: CellValue[][]): string[] {
  const { input, placement } = plan
  const row = rows[0] ?? []
  const problems: string[] = []
  const check = (col: number, label: string, expected: number | string | null) => {
    if (!same(row[col], expected)) problems.push(`${label}: ${String(row[col] ?? '(빈 칸)')}`)
  }
  check(0, '날짜', isoToSerial(input.date))
  if (typeof row[1] !== 'string' || row[1] === '' || row[1].startsWith('#')) problems.push(`요일: ${String(row[1] ?? '(빈 칸)')}`)
  check(2, '단가', input.unitPrice)
  check(3, '리터', input.liters)
  check(4, '주유비', expectedCost(input))
  check(6, '누적 km', input.odometerKm)
  check(8, '비고', input.memo)
  if (placement.mode === 'insert') {
    const next = rows[1] ?? []
    const nextDate = next[0]
    if (typeof nextDate !== 'number') problems.push('다음 기록 날짜를 읽을 수 없습니다')
    else if (!same(next[5], nextDate - isoToSerial(input.date))) problems.push(`다음 기록 경과일수: ${String(next[5] ?? '(빈 칸)')}`)
  }
  return problems
}

export interface FuelWriteResult {
  row: number
  mode: FuelPlacement['mode']
}

/**
 * 계획대로 쓰고 다시 읽어 확인한다. 저장 직전 시트를 다시 읽어 계획 이후 바뀌었으면 쓰지 않는다.
 * 쓰기 요청 중 네트워크 오류가 나면 저장 여부를 알 수 없으므로 'unknown' 오류를 던진다.
 */
export async function commitFuelWrite(token: string, settings: Settings, plan: FuelWritePlan, fetchImpl?: typeof fetch): Promise<FuelWriteResult> {
  const guard = checkWriteAllowed(settings)
  if (!guard.ok) throw new SheetsError('access', guard.reason)
  const { rows, records } = await readFuel(token, settings, fetchImpl)
  const placement = placeFuelRecord(records, rows, plan.input.date)
  if (rows.length !== plan.rowCount || placement.row !== plan.placement.row || placement.mode !== plan.placement.mode) {
    throw new SheetsError('api', '확인 후 시트가 바뀌었습니다. 기록을 다시 읽고 저장해 주세요.')
  }

  try {
    await batchUpdate(token, settings.spreadsheetId, buildFuelWriteRequests(plan), fetchImpl)
  } catch (e) {
    if (e instanceof SheetsError && e.kind === 'network') {
      throw new SheetsError('network', '저장 요청 중 연결이 끊겨 저장되었는지 알 수 없습니다. 기록을 다시 읽어 확인한 뒤, 없을 때만 다시 저장해 주세요.')
    }
    throw e
  }

  const r = plan.placement.row
  const [written = []] = await batchGetValues(token, settings.spreadsheetId, [`${quoteSheetName(settings.fuelSheetName)}!A${r}:I${r + 1}`], fetchImpl)
  const problems = verifyFuelRows(plan, written)
  if (problems.length > 0) {
    throw new SheetsError('api', `저장 후 확인한 값이 다릅니다(${r}행). 시트를 직접 확인해 주세요: ${problems.join(', ')}`)
  }
  return { row: r, mode: plan.placement.mode }
}
