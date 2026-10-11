import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { GoogleSession } from '../session/useGoogleSession.ts'
import { pickSpreadsheet } from '../sheets/picker.ts'
import { createBackup, parseBackup, validateSettings, type Settings, type SheetTarget } from './settings.ts'

interface Props {
  settings: Settings
  session: GoogleSession
  onChange: (settings: Settings) => void
}

type Message = { kind: 'success' | 'error'; text: string } | null

export function SettingsView({ settings, session, onChange }: Props) {
  const [picking, setPicking] = useState(false)
  const [target, setTarget] = useState<SheetTarget>(settings.target)
  const [fuelSheetName, setFuelSheetName] = useState(settings.fuelSheetName)
  const [maintenanceSheetName, setMaintenanceSheetName] = useState(settings.maintenanceSheetName)
  const [message, setMessage] = useState<Message>(null)

  const applyToForm = (next: Settings) => {
    setTarget(next.target)
    setFuelSheetName(next.fuelSheetName)
    setMaintenanceSheetName(next.maintenanceSheetName)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const result = validateSettings({ ...settings, target, fuelSheetName, maintenanceSheetName })
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error })
      return
    }
    onChange(result.settings)
    applyToForm(result.settings)
    setMessage({ kind: 'success', text: '이 기기에 설정을 저장했습니다.' })
  }

  const handlePick = async () => {
    if (!session.config) {
      setMessage({ kind: 'error', text: 'Google 설정이 없어 파일을 선택할 수 없습니다.' })
      return
    }
    setMessage(null)
    const accessToken = session.token ?? (await session.signIn())
    if (!accessToken) return
    setPicking(true)
    try {
      const file = await pickSpreadsheet(session.config, accessToken)
      if (!file) return
      onChange({ ...settings, spreadsheetId: file.id, spreadsheetName: file.name })
      setMessage({ kind: 'success', text: `"${file.name}" 파일을 연결했습니다.` })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : '파일 선택에 실패했습니다.' })
    } finally {
      setPicking(false)
    }
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
        <div className="row spread">
          <div>
            <div>{settings.spreadsheetName || (settings.spreadsheetId ? '이름 없는 파일' : '선택한 파일 없음')}</div>
            {settings.spreadsheetId && <div className="hint mono">{settings.spreadsheetId}</div>}
          </div>
          <button type="button" onClick={handlePick} disabled={picking || session.signingIn}>
            {settings.spreadsheetId ? '다른 파일 선택' : 'Google Drive에서 선택'}
          </button>
        </div>
        <p className="hint">앱은 여기서 고른 파일에만 접근합니다(drive.file 권한).</p>
        <form onSubmit={handleSubmit} className="form">
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
          <button type="submit">대상·탭 이름 저장</button>
        </form>
        <p className="hint">입력 화면에서 저장하면 선택한 파일에 기록됩니다. 원본을 사용하려면 파일을 선택하고 연결 대상을 원본으로 저장하세요.</p>
      </section>

      <section className="card">
        <h2>설정 백업</h2>
        <p className="hint">설정은 이 기기의 브라우저에만 저장됩니다. 앱 주소가 바뀌거나 다른 기기에서 쓸 때는 백업 파일로 옮기세요. 백업 파일에는 스프레드시트 ID가 들어 있으니 공유하지 마세요.</p>
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
