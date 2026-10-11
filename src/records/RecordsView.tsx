import { useState } from 'react'
import type { FuelRecord, MaintenanceRecord, RowWarning } from '../domain/types'
import { formatDate, formatKm, formatLiters, formatWon } from '../format'
import type { Logbook } from '../sheets/readLogbook'

interface Props {
  /** 연결된 스프레드시트 이름. 아직 연결 정보를 읽지 못했으면 null */
  spreadsheetName: string | null
  logbook: Logbook | null
  loading: boolean
  error: string | null
  onRefresh: () => Promise<void>
}

type Kind = 'fuel' | 'maintenance'
const PAGE_SIZE = 30

export function RecordsView({ spreadsheetName, logbook, loading, error, onRefresh }: Props) {
  const [kind, setKind] = useState<Kind>('fuel')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const fuel = logbook ? [...logbook.fuel].reverse() : []
  const maintenance = logbook ? [...logbook.maintenance].reverse() : []
  const warnings = logbook ? (kind === 'fuel' ? logbook.fuelWarnings : logbook.maintenanceWarnings) : []

  return (
    <>
      <section className="card">
        <div className="row spread">
          <div>
            <strong>{spreadsheetName ?? '차계부'}</strong>
            {logbook && <p className="hint">{logbook.loadedAt.toLocaleString('ko-KR')}에 읽음</p>}
          </div>
          <button type="button" onClick={() => void onRefresh()} disabled={loading || spreadsheetName === null}>
            {loading ? '읽는 중…' : logbook ? '새로고침' : '시트 읽기'}
          </button>
        </div>
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
      </section>

      {logbook && (
        <>
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={kind === 'fuel'} className={kind === 'fuel' ? 'active' : ''} onClick={() => setKind('fuel')}>
              주유 {logbook.fuel.length}건
            </button>
            <button type="button" role="tab" aria-selected={kind === 'maintenance'} className={kind === 'maintenance' ? 'active' : ''} onClick={() => setKind('maintenance')}>
              정비 {logbook.maintenance.length}건
            </button>
          </div>

          {warnings.length > 0 && <Warnings warnings={warnings} />}

          {kind === 'fuel' ? (
            <ul className="records">
              {fuel.slice(0, visible).map((r) => (
                <FuelItem key={r.sheetRow} record={r} />
              ))}
            </ul>
          ) : (
            <ul className="records">
              {maintenance.map((r) => (
                <MaintenanceItem key={r.sheetRow} record={r} />
              ))}
            </ul>
          )}
          {kind === 'fuel' && visible < fuel.length && (
            <button type="button" className="secondary" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              더 보기 ({fuel.length - visible}건 남음)
            </button>
          )}
        </>
      )}
    </>
  )
}

function FuelItem({ record }: { record: FuelRecord }) {
  return (
    <li className="record">
      <div className="record-head">
        <span>{formatDate(record.date)}</span>
        <strong>{formatWon(record.cost)}</strong>
      </div>
      <div className="record-meta">
        <span>{formatLiters(record.liters)}</span>
        <span>단가 {formatWon(record.unitPrice)}</span>
        <span>{formatKm(record.odometerKm)}</span>
      </div>
      {record.memo && <p className="record-memo">{record.memo}</p>}
    </li>
  )
}

function MaintenanceItem({ record }: { record: MaintenanceRecord }) {
  return (
    <li className="record">
      <div className="record-head">
        <span>{formatDate(record.date)}</span>
        <strong>{record.cost === null ? '금액 미입력' : formatWon(record.cost)}</strong>
      </div>
      <div className="record-meta">
        <span>{record.vendor ?? '업체 미입력'}</span>
        <span>{formatKm(record.odometerKm)}</span>
      </div>
      <p className="record-memo">{record.items.join(', ') || '항목 없음'}</p>
    </li>
  )
}

function Warnings({ warnings }: { warnings: RowWarning[] }) {
  return (
    <details className="card warnings">
      <summary>읽으면서 확인이 필요한 행 {warnings.length}개</summary>
      <ul>
        {warnings.map((w, i) => (
          <li key={`${w.sheetRow}-${i}`}>
            {w.sheetRow}행: {w.message}
          </li>
        ))}
      </ul>
    </details>
  )
}
