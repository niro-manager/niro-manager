import { useState, type ChangeEvent, type FormEvent } from 'react'
import { createBackup, extractSpreadsheetId, parseBackup, validateSettings, type Settings, type SheetTarget } from './settings.ts'

interface Props {
  settings: Settings
  onChange: (settings: Settings) => void
}

type Message = { kind: 'success' | 'error'; text: string } | null

export function SettingsView({ settings, onChange }: Props) {
  const [sheetInput, setSheetInput] = useState(settings.spreadsheetId)
  const [target, setTarget] = useState<SheetTarget>(settings.target)
  const [fuelSheetName, setFuelSheetName] = useState(settings.fuelSheetName)
  const [maintenanceSheetName, setMaintenanceSheetName] = useState(settings.maintenanceSheetName)
  const [message, setMessage] = useState<Message>(null)

  const applyToForm = (next: Settings) => {
    setSheetInput(next.spreadsheetId)
    setTarget(next.target)
    setFuelSheetName(next.fuelSheetName)
    setMaintenanceSheetName(next.maintenanceSheetName)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const spreadsheetId = sheetInput.trim() === '' ? '' : extractSpreadsheetId(sheetInput)
    if (spreadsheetId === null) {
      setMessage({ kind: 'error', text: '스프레드시트 URL 또는 ID 형식이 올바르지 않습니다.' })
      return
    }
    const result = validateSettings({ spreadsheetId, target, fuelSheetName, maintenanceSheetName })
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
        <form onSubmit={handleSubmit} className="form">
          <label>
            스프레드시트 URL 또는 ID
            <input value={sheetInput} onChange={(e) => setSheetInput(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." autoComplete="off" />
          </label>
          <fieldset>
            <legend>연결 대상</legend>
            <label className="inline">
              <input type="radio" name="target" checked={target === 'copy'} onChange={() => setTarget('copy')} /> 테스트용 복사본
            </label>
            <label className="inline">
              <input type="radio" name="target" checked={target === 'original'} onChange={() => setTarget('original')} /> 원본
            </label>
          </fieldset>
          <label>
            주유 탭 이름
            <input value={fuelSheetName} onChange={(e) => setFuelSheetName(e.target.value)} />
          </label>
          <label>
            정비 탭 이름
            <input value={maintenanceSheetName} onChange={(e) => setMaintenanceSheetName(e.target.value)} />
          </label>
          <button type="submit">저장</button>
        </form>
        <p className="hint">1단계는 읽기 전용입니다. 앱은 시트에 쓰지 않습니다.</p>
      </section>

      <section className="card">
        <h2>설정 백업</h2>
        <p className="hint">설정은 이 기기의 브라우저에만 저장됩니다. 앱 주소가 바뀌거나 다른 기기에서 쓸 때는 백업 파일로 옮기세요.</p>
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
