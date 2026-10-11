import { useState } from 'react'
import { targetOf, type SheetConnection } from '../sheets/sheetsClient'
import { checkWriteAllowed } from '../sheets/writeGuard'
import { FuelEntryView } from './FuelEntryView'
import { MaintenanceEntryView } from './MaintenanceEntryView'

interface Props {
  connection: SheetConnection
  onSaved: () => void
}

export function EntryView({ connection, onSaved }: Props) {
  const [kind, setKind] = useState<'fuel' | 'maintenance'>('fuel')
  const guard = checkWriteAllowed(connection)
  if (!guard.ok) {
    return (
      <section className="card">
        <h2>입력</h2>
        <p>{guard.reason}</p>
      </section>
    )
  }
  return (
    <>
      <p className="message notice">
        <strong>{connection.spreadsheetName}</strong>에 저장합니다({targetOf(connection.spreadsheetName) === 'original' ? '원본 차계부' : '테스트용 복사본'}).
      </p>
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={kind === 'fuel'} className={kind === 'fuel' ? 'active' : ''} onClick={() => setKind('fuel')}>
          주유
        </button>
        <button type="button" role="tab" aria-selected={kind === 'maintenance'} className={kind === 'maintenance' ? 'active' : ''} onClick={() => setKind('maintenance')}>
          정비
        </button>
      </div>
      {kind === 'fuel' ? <FuelEntryView connection={connection} onSaved={onSaved} /> : <MaintenanceEntryView connection={connection} onSaved={onSaved} />}
    </>
  )
}
