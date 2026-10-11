import { useEffect, useMemo, useState } from 'react'
import { ChartsView } from './charts/ChartsView.tsx'
import { EntryView } from './entry/EntryView.tsx'
import { RecordsView } from './records/RecordsView.tsx'
import { isStale, useLogbook } from './records/useLogbook.ts'
import { useOnline } from './session/useOnline.ts'
import { SettingsView } from './settings/SettingsView.tsx'
import { loadSettings, saveSettings, type Settings } from './settings/settings.ts'
import { createAppsScriptBackend, isInAppsScript } from './sheets/appsScriptBackend.ts'
import { targetOf, type SheetConnection } from './sheets/sheetsClient.ts'
import { ORIGINAL_WRITE_ENABLED } from './sheets/writeGuard.ts'

type Tab = 'records' | 'entry' | 'charts' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'records', label: '기록' },
  { id: 'entry', label: '입력' },
  { id: 'charts', label: '월별 차트' },
  { id: 'settings', label: '설정' },
]

const backend = createAppsScriptBackend()

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [tab, setTab] = useState<Tab>('records')
  // 웹 앱은 Apps Script가 들어 있는 스프레드시트에 소유자 계정으로 연결된다. 앱에서 따로 로그인하지 않는다.
  const [spreadsheetName, setSpreadsheetName] = useState<string | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const connection: SheetConnection | null = useMemo(
    () => (spreadsheetName === null ? null : { backend, spreadsheetName, ...settings }),
    [spreadsheetName, settings],
  )
  // 읽은 기록은 메모리에만 둔다(브라우저 저장소에 캐시하지 않음).
  const { logbook, loading, error, load, clear } = useLogbook(connection)

  const fetchInfo = () =>
    backend.getInfo().then(
      (info) => setSpreadsheetName(info.name),
      (e: unknown) => setInfoError(e instanceof Error ? e.message : '스프레드시트 정보를 읽지 못했습니다.'),
    )
  const loadInfo = () => {
    setInfoError(null)
    return fetchInfo()
  }

  useEffect(() => {
    void fetchInfo()
  }, [])

  // 동기화 시점: 앱을 열면(연결 정보를 읽으면) 바로 읽고, 탭 이름이 바뀌면 다시 읽는다.
  useEffect(() => {
    void load()
  }, [load])

  // 앱으로 돌아왔을 때 마지막으로 읽은 지 5분이 지났으면 다시 읽는다.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isStale(logbook)) void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [logbook, load])

  // 연결이 돌아오면 바로 다시 읽는다(오프라인 A+).
  const online = useOnline()
  useEffect(() => {
    const onOnline = () => {
      if (spreadsheetName === null) void loadInfo()
      else void load()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [spreadsheetName, load])

  const refresh = async () => {
    if (spreadsheetName === null) await loadInfo()
    else await load()
  }

  const updateSettings = (next: Settings) => {
    saveSettings(next)
    if (next.fuelSheetName !== settings.fuelSheetName || next.maintenanceSheetName !== settings.maintenanceSheetName) clear()
    setSettings(next)
  }

  const target = spreadsheetName === null ? null : targetOf(spreadsheetName)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Niro Manager</h1>
        <div className="row">
          {target && (
            <span className={`badge badge-${target}`}>{target === 'copy' ? '테스트 복사본' : ORIGINAL_WRITE_ENABLED ? '원본 · 저장 가능' : '원본 · 읽기 전용'}</span>
          )}
        </div>
      </header>
      {!online && (
        <p role="status" className="message offline">
          오프라인입니다. {logbook ? '마지막으로 읽은 기록을 보여 줍니다. ' : ''}저장은 연결된 뒤에 할 수 있고, 연결되면 다시 읽습니다.
        </p>
      )}
      {!isInAppsScript() && <p className="message error">Apps Script 웹 앱 주소로 열어야 차계부에 연결됩니다. docs/APPS_SCRIPT_SETUP.md를 확인해 주세요.</p>}
      {infoError && (
        <p role="alert" className="message error">
          {infoError}{' '}
          <button type="button" className="secondary small" onClick={() => void loadInfo()}>
            다시 시도
          </button>
        </p>
      )}
      <nav className="tabs" aria-label="화면">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={t.id === tab ? 'tab active' : 'tab'} aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'records' && (
          <RecordsView spreadsheetName={spreadsheetName} logbook={logbook} loading={loading} error={error} onRefresh={refresh} />
        )}
        {tab === 'entry' &&
          (connection ? (
            <EntryView connection={connection} onSaved={() => void load()} />
          ) : (
            <section className="card">
              <h2>입력</h2>
              <p>차계부 연결 정보를 읽은 뒤 입력할 수 있습니다.</p>
            </section>
          ))}
        {tab === 'charts' && <ChartsView logbook={logbook} onGoToRecords={() => setTab('records')} />}
        {tab === 'settings' && <SettingsView settings={settings} spreadsheetName={spreadsheetName} onChange={updateSettings} />}
      </main>
    </div>
  )
}
