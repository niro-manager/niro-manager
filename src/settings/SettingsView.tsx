import { useState, type ChangeEvent, type FormEvent } from 'react'
import { targetOf } from '../sheets/sheetsClient.ts'
import { createBackup, parseBackup, validateSettings, type Settings } from './settings.ts'

interface Props {
  settings: Settings
  /** 연결된 스프레드시트 이름. 아직 읽지 못했으면 null */
  spreadsheetName: string | null
  onChange: (settings: Settings) => void
}

type Message = { kind: 'success' | 'error'; text: string } | null

export function SettingsView({ settings, spreadsheetName, onChange }: Props) {
  const [fuelSheetName, setFuelSheetName] = useState(settings.fuelSheetName)
  const [maintenanceSheetName, setMaintenanceSheetName] = useState(settings.maintenanceSheetName)
  const [message, setMessage] = useState<Message>(null)

  const applyToForm = (next: Settings) => {
    setFuelSheetName(next.fuelSheetName)
    setMaintenanceSheetName(next.maintenanceSheetName)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const result = validateSettings({ fuelSheetName, maintenanceSheetName })
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error })
      return
    }
    onChange(result.settings)
    applyToForm(result.settings)
    setMessage({ kind: 'success', text: '이 기기에 설정을 저장했습니다.' })
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(createBackup(settings), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `niro-manager-settings-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = parseBackup(await file.text())
    if (!result.ok) {
      setMessage({ kind: 'error', text: `불러오기 실패: ${result.error}` })
      return
    }
    onChange(result.settings)
    applyToForm(result.settings)
    setMessage({ kind: 'success', text: '백업에서 설정을 불러왔습니다.' })
  }

  return (
    <>
      <section className="card">
        <h2>시트 연결</h2>
        <div>{spreadsheetName ?? '연결 정보를 읽는 중…'}</div>
        {spreadsheetName !== null && <p className="hint">{targetOf(spreadsheetName) === 'original' ? '원본 차계부' : '테스트용 복사본'} · 이 앱은 Apps Script가 들어 있는 스프레드시트에만 연결됩니다.</p>}
        <form onSubmit={handleSubmit} className="form">
          <label>
            주유 탭 이름
            <input value={fuelSheetName} onChange={(e) => setFuelSheetName(e.target.value)} />
          </label>
          <label>
            정비 탭 이름
            <input value={maintenanceSheetName} onChange={(e) => setMaintenanceSheetName(e.target.value)} />
          </label>
          <button type="submit">탭 이름 저장</button>
        </form>
      </section>

      <section className="card">
        <h2>설정 백업</h2>
        <p className="hint">설정(탭 이름)은 이 기기의 브라우저에만 저장됩니다. 다른 기기에서 쓸 때는 백업 파일로 옮기세요.</p>
        <div className="row">
          <button type="button" onClick={handleExport}>내보내기</button>
          <label className="button">
            불러오기
            <input type="file" accept="application/json,.json" onChange={handleImport} hidden />
          </label>
        </div>
      </section>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`message ${message.kind}`}>
          {message.text}
        </p>
      )}
    </>
  )
}
