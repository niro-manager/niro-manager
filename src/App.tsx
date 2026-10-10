import { useEffect, useMemo, useState } from 'react'
import { ChartsView } from './charts/ChartsView.tsx'
import { EntryView } from './entry/EntryView.tsx'
import { RecordsView } from './records/RecordsView.tsx'
import { isStale, useLogbook } from './records/useLogbook.ts'
import { useGoogleSession, type GoogleSession } from './session/useGoogleSession.ts'
import { SettingsView } from './settings/SettingsView.tsx'
import { loadSettings, saveSettings, type Settings } from './settings/settings.ts'

type Tab = 'records' | 'entry' | 'charts' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'records', label: '기록' },
  { id: 'entry', label: '입력' },
  { id: 'charts', label: '월별 차트' },
  { id: 'settings', label: '설정' },
]

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [tab, setTab] = useState<Tab>(() => (loadSettings().spreadsheetId ? 'records' : 'settings'))
  // 읽은 기록은 메모리에만 둔다(브라우저 저장소나 서비스 워커에 캐시하지 않음).
  const { logbook, loading, error, load, clear } = useLogbook(settings)
  const baseSession = useGoogleSession()

  // 동기화 시점(2026-10-10 합의): 로그인 직후 바로 읽는다. 로그인 창은 사용자가 버튼을 눌렀을 때만 열린다.
  const session: GoogleSession = useMemo(
    () => ({
      ...baseSession,
      signIn: async () => {
        const token = await baseSession.signIn()
        if (token) void load(token, baseSession.expire)
        return token
      },
    }),
    [baseSession, load],
  )

  // 앱으로 돌아왔을 때 마지막으로 읽은 지 5분이 지났으면, 토큰이 유효한 동안만 다시 읽는다.
  const { currentToken, expire } = baseSession
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const token = currentToken()
      // 토큰이 만료됐으면 세션을 비워 화면이 "로그인" 버튼으로 바뀌게 한다(로그인 창은 열지 않음).
      if (!token) return expire()
      if (settings.spreadsheetId && isStale(logbook)) void load(token, expire)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [settings.spreadsheetId, logbook, currentToken, expire, load])

  const refresh = async () => {
    const token = currentToken()
    if (token) await load(token, expire)
    else await session.signIn()
  }

  const updateSettings = (next: Settings) => {
    saveSettings(next)
    if (next.spreadsheetId !== settings.spreadsheetId || next.fuelSheetName !== settings.fuelSheetName || next.maintenanceSheetName !== settings.maintenanceSheetName) {
      clear()
    }
    setSettings(next)
  }

  // 저장 후 목록·차트가 새 기록을 반영하도록 바로 다시 읽는다.
  const reloadAfterSave = () => {
    const token = currentToken()
    if (token) void load(token, expire)
  }

  const signOut = async () => {
    await baseSession.signOut()
    clear()
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Niro Manager</h1>
        <div className="row">
          <span className={`badge badge-${settings.target}`}>{settings.target === 'copy' ? '테스트 복사본' : '원본 · 읽기 전용'}</span>
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
        {tab === 'records' && (
          <RecordsView settings={settings} signedIn={session.token !== null} signingIn={session.signingIn} logbook={logbook} loading={loading} error={error} onRefresh={refresh} />
        )}
        {tab === 'entry' && <EntryView settings={settings} session={session} onSaved={reloadAfterSave} />}
        {tab === 'charts' && <ChartsView logbook={logbook} onGoToRecords={() => setTab('records')} />}
        {tab === 'settings' && <SettingsView settings={settings} session={session} onChange={updateSettings} />}
      </main>
    </div>
  )
}
