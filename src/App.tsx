import { useState } from 'react'
import { RecordsView } from './records/RecordsView.tsx'
import { useGoogleSession } from './session/useGoogleSession.ts'
import { SettingsView } from './settings/SettingsView.tsx'
import { loadSettings, saveSettings, type Settings } from './settings/settings.ts'
import type { Logbook } from './sheets/readLogbook.ts'

type Tab = 'records' | 'charts' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'records', label: '기록' },
  { id: 'charts', label: '월별 차트' },
  { id: 'settings', label: '설정' },
]

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [tab, setTab] = useState<Tab>(() => (loadSettings().spreadsheetId ? 'records' : 'settings'))
  // 읽은 기록은 메모리에만 둔다(브라우저 저장소나 서비스 워커에 캐시하지 않음).
  const [logbook, setLogbook] = useState<Logbook | null>(null)
  const session = useGoogleSession()

  const updateSettings = (next: Settings) => {
    saveSettings(next)
    if (next.spreadsheetId !== settings.spreadsheetId || next.fuelSheetName !== settings.fuelSheetName || next.maintenanceSheetName !== settings.maintenanceSheetName) {
      setLogbook(null)
    }
    setSettings(next)
  }

  const signOut = async () => {
    await session.signOut()
    setLogbook(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Niro Manager</h1>
        <div className="row">
          <span className={`badge badge-${settings.target}`}>{settings.target === 'copy' ? '테스트 복사본' : '원본'} · 읽기 전용</span>
          {session.token ? (
            <button type="button" className="secondary small" onClick={signOut}>
              로그아웃
            </button>
          ) : (
            <button type="button" className="small" onClick={() => void session.signIn()} disabled={session.signingIn || !session.config}>
              {session.signingIn ? '로그인 중…' : 'Google 로그인'}
            </button>
          )}
        </div>
      </header>
      {!session.config && <p className="message error">Google 설정이 빌드에 없어 로그인할 수 없습니다. README의 Google 설정 절차를 확인해 주세요.</p>}
      {session.error && (
        <p role="alert" className="message error">
          {session.error}
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
        {tab === 'records' && <RecordsView settings={settings} session={session} logbook={logbook} onLoaded={setLogbook} />}
        {tab === 'charts' && (
          <section className="card">
            <h2>월별 차트</h2>
            <p>집계 기준을 합의한 뒤 만듭니다.</p>
          </section>
        )}
        {tab === 'settings' && <SettingsView settings={settings} session={session} onChange={updateSettings} />}
      </main>
    </div>
  )
}
