import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  createBackup,
  extractSpreadsheetId,
  loadSettings,
  parseBackup,
  saveSettings,
  type Settings,
} from './settings'

const FAKE_ID = 'abcdefghijklmnopqrstuvwxyz_0123456789-AB'
const SETTINGS: Settings = { ...DEFAULT_SETTINGS, spreadsheetId: FAKE_ID }

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

describe('extractSpreadsheetId', () => {
  it('URL과 ID를 모두 받는다', () => {
    expect(extractSpreadsheetId(`https://docs.google.com/spreadsheets/d/${FAKE_ID}/edit#gid=0`)).toBe(FAKE_ID)
    expect(extractSpreadsheetId(` ${FAKE_ID} `)).toBe(FAKE_ID)
  })
  it('형식이 맞지 않으면 null', () => {
    expect(extractSpreadsheetId('짧음')).toBeNull()
    expect(extractSpreadsheetId('https://example.com')).toBeNull()
  })
})

describe('백업과 불러오기', () => {
  it('내보낸 백업을 그대로 불러온다', () => {
    const json = JSON.stringify(createBackup(SETTINGS, new Date('2026-10-10T00:00:00Z')))
    expect(parseBackup(json)).toEqual({ ok: true, settings: SETTINGS })
  })
  it('다른 형식이나 깨진 파일은 거부한다', () => {
    expect(parseBackup('not json').ok).toBe(false)
    expect(parseBackup(JSON.stringify({ format: 'other', version: 1, settings: SETTINGS })).ok).toBe(false)
    expect(parseBackup(JSON.stringify({ ...createBackup(SETTINGS), version: 2 })).ok).toBe(false)
    expect(parseBackup(JSON.stringify(createBackup({ ...SETTINGS, target: 'x' as never }))).ok).toBe(false)
    expect(parseBackup(JSON.stringify(createBackup({ ...SETTINGS, spreadsheetId: 'bad id' }))).ok).toBe(false)
  })
})

describe('localStorage 저장', () => {
  it('저장한 설정을 다시 읽는다', () => {
    const storage = memoryStorage()
    saveSettings(SETTINGS, storage)
    expect(loadSettings(storage)).toEqual(SETTINGS)
  })
  it('없거나 깨진 값이면 기본값', () => {
    const storage = memoryStorage()
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS)
    storage.setItem(SETTINGS_STORAGE_KEY, '{broken')
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS)
  })
})
