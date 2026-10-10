import { useState } from 'react'
import { SettingsView } from './settings/SettingsView.tsx'
import { loadSettings, saveSettings, type Settings } from './settings/settings.ts'

type Tab = 'records' | 'charts' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'records', label: '기록' },
  { id: 'charts', label: '월별 차트' },
  { id: 'settings', label: '설정' },
]

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [tab, setTab] = useState<Tab>(() => (loadSettings().spreadsheetId ? 'records' : 'settings'))

  const updateSettings = (next: Settings) => {
    saveSettings(next)
    setSettings(next)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Niro Manager</h1>
        <span className={`badge badge-${settings.target}`}>{settings.target === 'copy' ? '테스트 복사본' : '원본'} · 읽기 전용</span>
      </header>
      <nav className="tabs" aria-label="화면">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={t.id === tab ? 'tab active' : 'tab'} aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'records' && <Placeholder title="기록" settings={settings} />}
        {tab === 'charts' && <Placeholder title="월별 차트" settings={settings} />}
        {tab === 'settings' && <SettingsView settings={settings} onChange={updateSettings} />}
      </main>
    </div>
  )
}

function Placeholder({ title, settings }: { title: string; settings: Settings }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {settings.spreadsheetId ? <p>Google 로그인과 시트 읽기는 다음 단계에서 연결합니다.</p> : <p>먼저 설정에서 연결할 스프레드시트를 지정해 주세요.</p>}
    </section>
  )
}
