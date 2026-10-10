import { useState } from 'react'
import type { GoogleSession } from '../session/useGoogleSession'
import type { Settings } from '../settings/settings'
import { checkWriteAllowed } from '../sheets/writeGuard'
import { FuelEntryView } from './FuelEntryView'
import { MaintenanceEntryView } from './MaintenanceEntryView'

interface Props {
  settings: Settings
  session: GoogleSession
  onSaved: () => void
}

export function EntryView({ settings, session, onSaved }: Props) {
  const [kind, setKind] = useState<'fuel' | 'maintenance'>('fuel')
  const guard = checkWriteAllowed(settings)
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
        <strong>{settings.spreadsheetName}</strong>에 저장합니다(테스트용 복사본).
      </p>
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={kind === 'fuel'} className={kind === 'fuel' ? 'active' : ''} onClick={() => setKind('fuel')}>
          주유
        </button>
        <button type="button" role="tab" aria-selected={kind === 'maintenance'} className={kind === 'maintenance' ? 'active' : ''} onClick={() => setKind('maintenance')}>
          정비
        </button>
      </div>
      {kind === 'fuel' ? <FuelEntryView settings={settings} session={session} onSaved={onSaved} /> : <MaintenanceEntryView settings={settings} session={session} onSaved={onSaved} />}
    </>
  )
}
