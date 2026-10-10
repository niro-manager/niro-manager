import { describe, expect, it } from 'vitest'
import type { CellValue } from '../domain/cells'
import { isoToSerial, type FuelInput } from '../domain/fuelInput'
import { DEFAULT_SETTINGS, type Settings } from '../settings/settings'
import { buildFuelWriteRequests, checkWriteAllowed, commitFuelWrite, planFuelWrite, verifyFuelRows } from './fuelWriter'
import { SheetsError } from './sheetsClient'

// 테스트 값은 실제 차계부가 아닌 임의 값이다.
const SETTINGS: Settings = { ...DEFAULT_SETTINGS, spreadsheetId: 'COPY_ID_0123456789abcdef', spreadsheetName: '테스트 차계부 (테스트 복사본)', target: 'copy' }
const INPUT: FuelInput = { date: '2026-01-12', unitPrice: 1500, liters: 20, manualCost: null, odometerKm: 1234, memo: '=위험한 메모' }
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
type Cell = number | string | { f: string } | null

/**
 * A:I만 다루는 가짜 시트. batchUpdate의 insertRange/copyPaste/updateCells를 적용하고,
 * 이 앱이 쓰는 수식(요일, 단가×리터, days)을 계산해 UNFORMATTED_VALUE처럼 돌려준다.
 */
class FakeSheet {
  // grid[row-1][col] = 입력값. 수식은 { f } 로 문자열과 구분한다
  grid: Cell[][]
  requests: unknown[][] = []
  failNextUpdate: 'network' | null = null

  constructor(records: [string, number | null, number | null, number | string | null][]) {
    this.grid = [['날짜', null, '단가', '리터', '주유비', '경과일수', '누적 키로수', null, '비고']]
    records.forEach(([date, price, liters, cost], i) => {
      const r = i + 2
      this.grid.push([isoToSerial(date), { f: `=vlookup(weekday(A${r}),$J$2:$K$8,2,0)` }, price, liters, cost ?? { f: `=C${r}*D${r}` }, r > 2 ? { f: `=days(A${r},A${r - 1})` } : null, null, null, null])
    })
  }

  private shiftFormula(f: string, fromRow: number): string {
    // 삽입 위치 이상을 가리키는 A~I 참조만 한 칸 내린다($J$2:$K$8은 그대로)
    return f.replace(/(?<![$\w])([A-I])(\d+)/g, (_, col: string, row: string) => `${col}${Number(row) >= fromRow ? Number(row) + 1 : row}`)
  }

  private evaluate(row: number, col: number): CellValue {
    const cell = this.grid[row - 1]?.[col] ?? null
    if (cell === null) return ''
    if (typeof cell !== 'object') return cell
    const raw = cell.f
    const ref = (c: string, r: string) => this.evaluate(Number(r), c.charCodeAt(0) - 65)
    let m = /^=vlookup\(weekday\(A(\d+)\)/.exec(raw)
    if (m) {
      const serial = ref('A', m[1]!)
      return typeof serial === 'number' ? WEEKDAYS[(serial + 6) % 7]! : '#N/A'
    }
    m = /^=C(\d+)\*D(\d+)$/.exec(raw)
    if (m) return Number(ref('C', m[1]!)) * Number(ref('D', m[2]!))
    m = /^=days\(A(\d+),A(\d+)\)$/.exec(raw)
    if (m) return Number(ref('A', m[1]!)) - Number(ref('A', m[2]!))
    return '#ERROR'
  }

  values(from: number, to: number): CellValue[][] {
    const out: CellValue[][] = []
    for (let r = from; r <= Math.min(to, this.grid.length); r++) out.push(Array.from({ length: 9 }, (_, c) => this.evaluate(r, c)))
    while (out.length && out[out.length - 1]!.every((v) => v === '')) out.pop()
    return out
  }

  apply(requests: any[]) {
    this.requests.push(requests)
    for (const req of requests) {
      if (req.insertRange) {
        const at = req.insertRange.range.startRowIndex + 1
        this.grid = this.grid.map((row) => row.map((v) => (v !== null && typeof v === 'object' ? { f: this.shiftFormula(v.f, at) } : v)))
        this.grid.splice(at - 1, 0, Array(9).fill(null))
      } else if (req.updateCells) {
        const { rowIndex, columnIndex } = req.updateCells.start
        while (this.grid.length <= rowIndex) this.grid.push(Array(9).fill(null))
        req.updateCells.rows[0].values.forEach((cell: any, i: number) => {
          const v = cell.userEnteredValue
          this.grid[rowIndex]![columnIndex + i] = !v ? null : v.formulaValue !== undefined ? { f: v.formulaValue } : (v.numberValue ?? v.stringValue)
        })
      }
    }
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    if (url.pathname.endsWith(':batchUpdate')) {
      if (this.failNextUpdate) {
        this.failNextUpdate = null
        this.apply(JSON.parse(String(init?.body)).requests) // 서버에는 반영됐지만 응답이 끊긴 경우
        throw new TypeError('Failed to fetch')
      }
      this.apply(JSON.parse(String(init?.body)).requests)
      return json({})
    }
    if (url.pathname.endsWith('/values:batchGet')) {
      const range = url.searchParams.get('ranges')!
      const m = /!A(\d+):I(\d*)$/.exec(range)!
      return json({ valueRanges: [{ values: this.values(Number(m[1]), m[2] ? Number(m[2]) : 10_000) }] })
    }
    return json({ sheets: [{ properties: { sheetId: 0, title: '시트1' } }] })
  }
}

const twoRecords = () =>
  new FakeSheet([
    ['2026-01-10', 1500, 16, null],
    ['2026-01-20', 1600, 16, 50000],
  ])

describe('checkWriteAllowed', () => {
  it('원본 쓰기는 꺼져 있다', () => {
    expect(checkWriteAllowed({ ...SETTINGS, target: 'original' }).ok).toBe(false)
  })
  it('복사본 표시인데 이름에 "복사본"이 없으면 막는다', () => {
    expect(checkWriteAllowed({ ...SETTINGS, spreadsheetName: '히로_차계부' }).ok).toBe(false)
    expect(checkWriteAllowed(SETTINGS).ok).toBe(true)
  })
})

describe('주유 기록 쓰기', () => {
  it('최신 날짜는 마지막 행 아래에 추가하고 수식을 함께 쓴다', async () => {
    const sheet = twoRecords()
    const plan = await planFuelWrite('T', SETTINGS, { ...INPUT, date: '2026-01-25' }, sheet.fetch)
    expect(plan.placement).toEqual({ row: 4, mode: 'append' })
    const result = await commitFuelWrite('T', SETTINGS, plan, sheet.fetch)
    expect(result).toEqual({ row: 4, mode: 'append' })
    expect(sheet.grid[3]).toEqual([isoToSerial('2026-01-25'), { f: '=vlookup(weekday(A4),$J$2:$K$8,2,0)' }, 1500, 20, { f: '=C4*D4' }, { f: '=days(A4,A3)' }, 1234, null, '=위험한 메모'])
    expect(sheet.values(4, 4)[0]?.slice(0, 6)).toEqual([isoToSerial('2026-01-25'), '일', 1500, 20, 30000, 5])
  })

  it('비고는 수식이 아닌 문자열로 쓴다', () => {
    const requests = buildFuelWriteRequests({ input: INPUT, placement: { row: 4, mode: 'append' }, sheetId: 0, rowCount: 2, duplicate: undefined, shiftedRecords: 0 }) as any[]
    const cells = requests.find((r) => r.updateCells).updateCells.rows[0].values
    expect(cells[8]).toEqual({ userEnteredValue: { stringValue: '=위험한 메모' } })
  })

  it('과거 날짜는 A:I만 밀어 끼워 넣고 다음 기록의 경과일수를 고친다', async () => {
    const sheet = twoRecords()
    const plan = await planFuelWrite('T', SETTINGS, INPUT, sheet.fetch)
    expect(plan.placement).toEqual({ row: 3, mode: 'insert' })
    expect(plan.shiftedRecords).toBe(1)
    await commitFuelWrite('T', SETTINGS, plan, sheet.fetch)
    const [insert] = sheet.requests[0] as any[]
    expect(insert.insertRange.range).toEqual({ sheetId: 0, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 9 })
    const rows = sheet.values(2, 4)
    expect(rows.map((r) => r[0])).toEqual([isoToSerial('2026-01-10'), isoToSerial('2026-01-12'), isoToSerial('2026-01-20')])
    expect(rows.map((r) => r[5])).toEqual(['', 2, 8])
    // 밀려난 기록의 직접 입력 금액과 요일 수식이 유지된다
    expect(rows[2]?.slice(1, 5)).toEqual(['화', 1600, 16, 50000])
  })

  it('가장 이른 날짜는 2행에 끼워 넣고 경과일수는 비워 둔다', async () => {
    const sheet = twoRecords()
    const plan = await planFuelWrite('T', SETTINGS, { ...INPUT, date: '2026-01-01' }, sheet.fetch)
    expect(plan.placement).toEqual({ row: 2, mode: 'insert' })
    await commitFuelWrite('T', SETTINGS, plan, sheet.fetch)
    expect(sheet.values(2, 3).map((r) => r[5])).toEqual(['', 9])
  })

  it('결제액 직접 입력은 값으로 쓴다', async () => {
    const sheet = twoRecords()
    const plan = await planFuelWrite('T', SETTINGS, { ...INPUT, date: '2026-01-25', manualCost: 50000 }, sheet.fetch)
    await commitFuelWrite('T', SETTINGS, plan, sheet.fetch)
    expect(sheet.grid[3]?.[4]).toBe(50000)
  })

  it('같은 내용 기록이 있으면 계획에 표시한다', async () => {
    const sheet = twoRecords()
    const plan = await planFuelWrite('T', SETTINGS, { date: '2026-01-10', unitPrice: 1500, liters: 16, manualCost: null, odometerKm: null, memo: null }, sheet.fetch)
    expect(plan.duplicate?.sheetRow).toBe(2)
  })

  it('계획 후 시트가 바뀌면 쓰지 않는다', async () => {
    const sheet = twoRecords()
    const plan = await planFuelWrite('T', SETTINGS, INPUT, sheet.fetch)
    sheet.grid.push([isoToSerial('2026-01-30'), null, 1, 1, null, null, null, null, null])
    await expect(commitFuelWrite('T', SETTINGS, plan, sheet.fetch)).rejects.toThrow('시트가 바뀌었습니다')
    expect(sheet.requests).toHaveLength(0)
  })

  it('쓰기 중 연결이 끊기면 저장 여부를 알 수 없다고 알린다', async () => {
    const sheet = twoRecords()
    const plan = await planFuelWrite('T', SETTINGS, { ...INPUT, date: '2026-01-25' }, sheet.fetch)
    sheet.failNextUpdate = 'network'
    const error = await commitFuelWrite('T', SETTINGS, plan, sheet.fetch).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SheetsError)
    expect((error as SheetsError).message).toContain('알 수 없습니다')
    // 다시 시도하면 같은 내용 기록을 찾아 중복을 경고할 수 있다
    const retry = await planFuelWrite('T', SETTINGS, { ...INPUT, date: '2026-01-25' }, sheet.fetch)
    expect(retry.duplicate?.sheetRow).toBe(4)
  })

  it('원본 대상이면 계획 단계에서 거부한다', async () => {
    const sheet = twoRecords()
    await expect(planFuelWrite('T', { ...SETTINGS, target: 'original' }, INPUT, sheet.fetch)).rejects.toThrow('원본 쓰기')
  })
})

describe('verifyFuelRows', () => {
  it('값이 다르면 문제 목록을 돌려준다', () => {
    const plan = { input: { ...INPUT, memo: null }, placement: { row: 4, mode: 'append' as const }, sheetId: 0, rowCount: 2, duplicate: undefined, shiftedRecords: 0 }
    expect(verifyFuelRows(plan, [[isoToSerial(INPUT.date), '월', 1500, 20, 30000, 2, 1234, '', '']])).toEqual([])
    expect(verifyFuelRows(plan, [[isoToSerial(INPUT.date), '#N/A', 1500, 20, 29000]])).toEqual(['요일: #N/A', '주유비: 29000', '누적 km: (빈 칸)'])
  })
})
