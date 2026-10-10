import type { CellValue } from '../domain/cells'
import { MAINTENANCE_FIRST_ROW, parseMaintenanceRows } from '../domain/maintenance'
import {
  findMaintenanceDuplicate,
  isMaintenanceSorted,
  maintenanceRows,
  placeMaintenanceRecord,
  type MaintenanceInput,
  type MaintenancePlacement,
} from '../domain/maintenanceInput'
import type { MaintenanceRecord } from '../domain/types'
import type { Settings } from '../settings/settings'
import { SheetsError, batchGetValues, batchUpdate, getSheetId, quoteSheetName } from './sheetsClient'
import { checkWriteAllowed } from './writeGuard'

// 정비 기록 쓰기(2단계). 시트2에는 수식이 없으므로 값만 쓴다.
const COLUMN_COUNT = 5 // A~E

export interface MaintenanceWritePlan {
  input: MaintenanceInput
  placement: MaintenancePlacement
  sheetId: number
  rowCount: number
  duplicate: MaintenanceRecord | undefined
  /** 끼워 넣을 때 아래로 밀리는 정비 건수 */
  shiftedRecords: number
  /** 서식을 복사할 이웃 정비의 첫 행(없으면 null) */
  formatSourceRow: number | null
}

function range(settings: Settings, from: number, to?: number): string {
  return `${quoteSheetName(settings.maintenanceSheetName)}!A${from}:E${to ?? ''}`
}

async function readMaintenance(token: string, settings: Settings, fetchImpl?: typeof fetch) {
  const [rows = []] = await batchGetValues(token, settings.spreadsheetId, [range(settings, MAINTENANCE_FIRST_ROW)], fetchImpl)
  return { rows, records: parseMaintenanceRows(rows).records }
}

export async function planMaintenanceWrite(token: string, settings: Settings, input: MaintenanceInput, fetchImpl?: typeof fetch): Promise<MaintenanceWritePlan> {
  const guard = checkWriteAllowed(settings)
  if (!guard.ok) throw new SheetsError('access', guard.reason)
  const sheetId = await getSheetId(token, settings.spreadsheetId, settings.maintenanceSheetName, fetchImpl)
  if (sheetId === null) throw new SheetsError('api', `"${settings.maintenanceSheetName}" 탭을 찾을 수 없습니다.`)
  const { rows, records } = await readMaintenance(token, settings, fetchImpl)
  const placement = placeMaintenanceRecord(records, rows, input.date)
  if (placement.mode === 'insert' && !isMaintenanceSorted(records)) {
    throw new SheetsError('api', '정비 기록이 날짜 순서대로가 아니어서 끼워 넣을 위치를 정할 수 없습니다.')
  }
  // 서식은 이웃 정비의 첫 행에서 복사한다. 끼워 넣으면 그 정비가 항목 수만큼 내려간 뒤다.
  const neighbour = placement.mode === 'insert' ? records.find((r) => r.sheetRow === placement.row) : records[records.length - 1]
  return {
    input,
    placement,
    sheetId,
    rowCount: rows.length,
    duplicate: findMaintenanceDuplicate(records, input),
    shiftedRecords: placement.mode === 'insert' ? records.filter((r) => r.sheetRow >= placement.row).length : 0,
    formatSourceRow: neighbour ? neighbour.sheetRow + (placement.mode === 'insert' ? input.items.length : 0) : null,
  }
}

type CellData = { userEnteredValue?: { numberValue?: number; stringValue?: string } }
const cell = (v: number | string | null): CellData =>
  v === null ? {} : typeof v === 'number' ? { userEnteredValue: { numberValue: v } } : { userEnteredValue: { stringValue: v } }

export function buildMaintenanceWriteRequests(plan: MaintenanceWritePlan): unknown[] {
  const { placement, sheetId } = plan
  const values = maintenanceRows(plan.input)
  const index = placement.row - 1
  const requests: unknown[] = []
  if (placement.mode === 'insert') {
    requests.push({
      insertRange: {
        range: { sheetId, startRowIndex: index, endRowIndex: index + values.length, startColumnIndex: 0, endColumnIndex: COLUMN_COUNT },
        shiftDimension: 'ROWS',
      },
    })
  }
  if (plan.formatSourceRow !== null) {
    const src = plan.formatSourceRow - 1
    requests.push({
      copyPaste: {
        source: { sheetId, startRowIndex: src, endRowIndex: src + 1, startColumnIndex: 0, endColumnIndex: COLUMN_COUNT },
        destination: { sheetId, startRowIndex: index, endRowIndex: index + 1, startColumnIndex: 0, endColumnIndex: COLUMN_COUNT },
        pasteType: 'PASTE_FORMAT',
      },
    })
  }
  requests.push({
    updateCells: { start: { sheetId, rowIndex: index, columnIndex: 0 }, rows: values.map((row) => ({ values: row.map(cell) })), fields: 'userEnteredValue' },
  })
  return requests
}

function same(actual: CellValue, expected: number | string | null): boolean {
  if (expected === null) return actual === undefined || actual === null || actual === ''
  if (typeof expected === 'number') return typeof actual === 'number' && Math.abs(actual - expected) < 0.005
  return actual === expected
}

export function verifyMaintenanceRows(plan: MaintenanceWritePlan, rows: CellValue[][]): string[] {
  const labels = ['날짜', '항목', '업체', '누적 km', '금액']
  const problems: string[] = []
  maintenanceRows(plan.input).forEach((expected, r) => {
    expected.forEach((value, c) => {
      const actual = rows[r]?.[c]
      if (!same(actual, value)) problems.push(`${plan.placement.row + r}행 ${labels[c]}: ${String(actual ?? '(빈 칸)')}`)
    })
  })
  return problems
}

export interface MaintenanceWriteResult {
  row: number
  mode: MaintenancePlacement['mode']
}

export async function commitMaintenanceWrite(token: string, settings: Settings, plan: MaintenanceWritePlan, fetchImpl?: typeof fetch): Promise<MaintenanceWriteResult> {
  const guard = checkWriteAllowed(settings)
  if (!guard.ok) throw new SheetsError('access', guard.reason)
  const { rows, records } = await readMaintenance(token, settings, fetchImpl)
  const placement = placeMaintenanceRecord(records, rows, plan.input.date)
  if (rows.length !== plan.rowCount || placement.row !== plan.placement.row || placement.mode !== plan.placement.mode) {
    throw new SheetsError('api', '확인 후 시트가 바뀌었습니다. 기록을 다시 읽고 저장해 주세요.')
  }
  try {
    await batchUpdate(token, settings.spreadsheetId, buildMaintenanceWriteRequests(plan), fetchImpl)
  } catch (e) {
    if (e instanceof SheetsError && e.kind === 'network') {
      throw new SheetsError('network', '저장 요청 중 연결이 끊겨 저장되었는지 알 수 없습니다. 기록을 다시 읽어 확인한 뒤, 없을 때만 다시 저장해 주세요.')
    }
    throw e
  }
  const first = plan.placement.row
  const last = first + plan.input.items.length - 1
  const [written = []] = await batchGetValues(token, settings.spreadsheetId, [range(settings, first, last)], fetchImpl)
  const problems = verifyMaintenanceRows(plan, written)
  if (problems.length > 0) throw new SheetsError('api', `저장 후 확인한 값이 다릅니다. 시트를 직접 확인해 주세요: ${problems.join(', ')}`)
  return { row: first, mode: plan.placement.mode }
}
