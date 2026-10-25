import { describe, expect, it } from 'vitest'
import type { CellValue } from '../domain/cells'
import { isoToSerial } from '../domain/fuelInput'
import type { MaintenanceInput } from '../domain/maintenanceInput'
import type { SheetConnection, SheetsBackend } from './sheetsClient'
import { buildMaintenanceWriteRequests, commitMaintenanceWrite, planMaintenanceWrite, verifyMaintenanceRows } from './maintenanceWriter'

// 테스트 값은 실제 차계부가 아닌 임의 값이다.
const COPY_NAME = '테스트 (테스트 복사본)'
const INPUT: MaintenanceInput = { date: '2025-06-01', items: ['브레이크 패드', '점검'], vendor: '업체C', odometerKm: 30000, cost: 0 }

/** A:E 값만 다루는 가짜 시트2. insertRange와 updateCells를 적용한다. */
class FakeSheet2 {
  grid: CellValue[][] = [
    [isoToSerial('2024-06-26'), '오일', '업체A', 9300],
    ['', '와이퍼'],
    [isoToSerial('2025-01-06'), '오일', '업체A', 22500],
    ['', '와이퍼'],
    [isoToSerial('2026-10-09'), '타이어'],
  ]
  requests: any[][] = []

  backend: SheetsBackend = {
    getInfo: async () => ({ name: COPY_NAME }),
    getSheetId: async (name) => (name === '시트2' ? 7 : null),
    ocrReceipt: async () => ({ text: '', tempFileLeft: false }),
    batchUpdate: async (requests: any[]) => {
      this.requests.push(requests)
      for (const req of requests) {
        if (req.insertRange) {
          const { startRowIndex, endRowIndex } = req.insertRange.range
          this.grid.splice(startRowIndex, 0, ...Array.from({ length: endRowIndex - startRowIndex }, () => []))
        } else if (req.updateCells) {
          req.updateCells.rows.forEach((row: any, i: number) => {
            this.grid[req.updateCells.start.rowIndex + i] = row.values.map((c: any) => c.userEnteredValue?.numberValue ?? c.userEnteredValue?.stringValue ?? '')
          })
        }
      }
    },
    batchGetValues: async ([range]) => {
      const m = /!A(\d+):E(\d*)$/.exec(range!)!
      const end = m[2] ? Number(m[2]) : this.grid.length
      return [this.grid.slice(Number(m[1]) - 1, end)]
    },
  }
}

const conn = (sheet: FakeSheet2, spreadsheetName = COPY_NAME): SheetConnection => ({ backend: sheet.backend, spreadsheetName, fuelSheetName: '시트1', maintenanceSheetName: '시트2' })

describe('정비 기록 쓰기', () => {
  it('최신 날짜는 마지막 행 아래에 항목 행들을 쓴다', async () => {
    const sheet = new FakeSheet2()
    const plan = await planMaintenanceWrite(conn(sheet), { ...INPUT, date: '2026-10-10' })
    expect(plan.placement).toEqual({ row: 6, mode: 'append' })
    expect(plan.formatSourceRow).toBe(5)
    await commitMaintenanceWrite(conn(sheet), plan)
    expect(sheet.grid.slice(5)).toEqual([
      [isoToSerial('2026-10-10'), '브레이크 패드', '업체C', 30000, 0],
      ['', '점검', '', '', ''],
    ])
  })

  it('과거 날짜는 정비 묶음 사이에 A:E만 항목 수만큼 밀어 끼워 넣는다', async () => {
    const sheet = new FakeSheet2()
    const plan = await planMaintenanceWrite(conn(sheet), INPUT)
    expect(plan.placement).toEqual({ row: 5, mode: 'insert' })
    expect(plan.shiftedRecords).toBe(1)
    expect(plan.formatSourceRow).toBe(7)
    await commitMaintenanceWrite(conn(sheet), plan)
    const [insert, copy] = sheet.requests[0]!
    expect(insert.insertRange.range).toEqual({ sheetId: 7, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 5 })
    expect(copy.copyPaste.source.startRowIndex).toBe(6)
    expect(sheet.grid.map((r) => r[1])).toEqual(['오일', '와이퍼', '오일', '와이퍼', '브레이크 패드', '점검', '타이어'])
  })

  it('금액 미입력(null)은 빈 칸으로 쓴다', () => {
    const plan = { input: { ...INPUT, cost: null }, placement: { row: 6, mode: 'append' as const }, sheetId: 7, rowCount: 5, duplicate: undefined, shiftedRecords: 0, formatSourceRow: null }
    const update = (buildMaintenanceWriteRequests(plan) as any[]).find((r) => r.updateCells)
    expect(update.updateCells.rows[0].values[4]).toEqual({})
  })

  it('같은 정비가 있으면 표시하고, 계획 후 시트가 바뀌면 쓰지 않는다', async () => {
    const sheet = new FakeSheet2()
    const dup = await planMaintenanceWrite(conn(sheet), { date: '2026-10-09', items: ['타이어'], vendor: null, odometerKm: null, cost: null })
    expect(dup.duplicate?.sheetRow).toBe(5)
    sheet.grid.push(['', '추가 항목'])
    await expect(commitMaintenanceWrite(conn(sheet), dup)).rejects.toThrow('시트가 바뀌었습니다')
  })

  it('원본 대상에서도 항목을 저장하고 기존 정비 기록을 보존한다', async () => {
    const sheet = new FakeSheet2()
    const plan = await planMaintenanceWrite(conn(sheet, '차계부'), INPUT)
    await commitMaintenanceWrite(conn(sheet, '차계부'), plan)
    expect(sheet.grid.map((r) => r[1])).toEqual(['오일', '와이퍼', '오일', '와이퍼', '브레이크 패드', '점검', '타이어'])
  })

  it('다시 읽은 값이 다르면 문제를 알린다', () => {
    const plan = { input: INPUT, placement: { row: 5, mode: 'insert' as const }, sheetId: 7, rowCount: 5, duplicate: undefined, shiftedRecords: 1, formatSourceRow: 7 }
    expect(verifyMaintenanceRows(plan, [[isoToSerial(INPUT.date), '브레이크 패드', '업체C', 30000, 0], ['', '점검']])).toEqual([])
    expect(verifyMaintenanceRows(plan, [[isoToSerial(INPUT.date), '브레이크 패드', '업체C', 30000]])).toEqual(['5행 금액: (빈 칸)', '6행 항목: (빈 칸)'])
  })
})
