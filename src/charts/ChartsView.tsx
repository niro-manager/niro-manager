import { useMemo, useState } from 'react'
import { summarizeMonthly, type MonthlySummary } from '../domain/monthly'
import { formatLiters, formatWon } from '../format'
import type { Logbook } from '../sheets/readLogbook'
import { MonthlyChart, type ChartPoint } from './MonthlyChart'

interface Props {
  logbook: Logbook | null
  onGoToRecords: () => void
}

type Range = 12 | 24 | 'all'
const RANGES: { id: Range; label: string }[] = [
  { id: 12, label: '최근 12개월' },
  { id: 24, label: '최근 24개월' },
  { id: 'all', label: '전체' },
]

const tickWon = (v: number) => (v >= 10000 ? `${v / 10000}만` : v.toLocaleString('ko-KR'))
const tickPlain = (v: number) => v.toLocaleString('ko-KR')
const formatPrice = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원/L`

function notes(...parts: (string | false)[]): string | undefined {
  const text = parts.filter(Boolean).join(' · ')
  return text || undefined
}

export function ChartsView({ logbook, onGoToRecords }: Props) {
  const [range, setRange] = useState<Range>(12)
  const monthly = useMemo(() => (logbook ? summarizeMonthly(logbook.fuel, logbook.maintenance) : []), [logbook])

  if (!logbook) {
    return (
      <section className="card">
        <h2>월별 차트</h2>
        <p>기록 화면에서 시트를 먼저 읽어 주세요.</p>
        <button type="button" onClick={onGoToRecords}>
          기록 화면으로
        </button>
      </section>
    )
  }

  const shown = range === 'all' ? monthly : monthly.slice(-range)
  // 시트를 읽은 시점의 달은 아직 끝나지 않았으므로 툴팁에 표시한다
  const readAt = logbook.loadedAt
  const currentMonth = `${readAt.getFullYear()}-${String(readAt.getMonth() + 1).padStart(2, '0')}`
  const series = (pick: (m: MonthlySummary) => ChartPoint): ChartPoint[] =>
    shown.map((m) => {
      const point = pick(m)
      return m.month === currentMonth ? { ...point, note: notes('이번 달(진행 중)', point.note ?? false) } : point
    })

  return (
    <>
      <div className="filters" role="group" aria-label="기간">
        {RANGES.map((r) => (
          <button key={r.id} type="button" className={r.id === range ? 'chip active' : 'chip'} aria-pressed={r.id === range} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <MonthlyChart
        title="주유비"
        kind="bar"
        format={formatWon}
        formatTick={tickWon}
        points={series((m) => ({ month: m.month, value: m.fuelCost, note: notes(`주유 ${m.fuelCount}회`, m.fuelCostMissing > 0 && `금액 없는 기록 ${m.fuelCostMissing}건 제외`) }))}
      />
      <MonthlyChart
        title="주유량"
        kind="bar"
        format={formatLiters}
        formatTick={tickPlain}
        points={series((m) => ({ month: m.month, value: m.liters, note: notes(`주유 ${m.fuelCount}회`, m.litersMissing > 0 && `리터 없는 기록 ${m.litersMissing}건 제외`) }))}
      />
      <MonthlyChart
        title="주유 단가 (리터 가중 평균)"
        kind="line"
        format={formatPrice}
        formatTick={tickPlain}
        points={series((m) => ({ month: m.month, value: m.unitPrice, note: m.unitPriceRows > 0 ? `${m.unitPriceRows}건 기준` : undefined }))}
      />
      <MonthlyChart
        title="정비비"
        kind="bar"
        format={formatWon}
        formatTick={tickWon}
        points={series((m) => ({
          month: m.month,
          value: m.maintenanceCost,
          note: notes(m.maintenanceCount > 0 && `정비 ${m.maintenanceCount}건`, m.maintenanceCostMissing > 0 && `금액 미입력 ${m.maintenanceCostMissing}건`),
        }))}
      />

      <details className="card">
        <summary>표로 보기</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">월</th>
                <th scope="col">주유비</th>
                <th scope="col">주유량</th>
                <th scope="col">단가</th>
                <th scope="col">정비비</th>
              </tr>
            </thead>
            <tbody>
              {[...shown].reverse().map((m) => (
                <tr key={m.month}>
                  <th scope="row">{m.month}</th>
                  <td>{formatWon(m.fuelCost)}</td>
                  <td>{formatLiters(m.liters)}</td>
                  <td>{m.unitPrice === null ? '—' : formatPrice(m.unitPrice)}</td>
                  <td>
                    {formatWon(m.maintenanceCost)}
                    {m.maintenanceCostMissing > 0 && <span className="muted"> (미입력 {m.maintenanceCostMissing})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">합계는 값이 있는 기록만 더합니다. 주유 단가는 Σ(단가×리터) ÷ Σ리터이며 단가와 리터가 모두 있는 기록만 씁니다.</p>
      </details>
    </>
  )
}
