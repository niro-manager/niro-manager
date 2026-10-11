import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, createBackup, loadSettings, parseBackup, saveSettings, type Settings } from './settings'

const SETTINGS: Settings = { fuelSheetName: '주유', maintenanceSheetName: '정비' }

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

describe('백업과 불러오기', () => {
  it('내보낸 백업을 그대로 불러온다', () => {
    const json = JSON.stringify(createBackup(SETTINGS, new Date('2026-10-10T00:00:00Z')))
    expect(parseBackup(json)).toEqual({ ok: true, settings: SETTINGS })
  })
  it('이전 버전 백업은 탭 이름만 불러온다', () => {
    const legacy = { spreadsheetId: 'abcdefghijklmnopqrstuvwxyz_0123456789-AB', spreadsheetName: '테스트', target: 'copy', ...SETTINGS }
    const json = JSON.stringify({ format: 'niro-manager-settings', version: 1, exportedAt: '', settings: legacy })
    expect(parseBackup(json)).toEqual({ ok: true, settings: SETTINGS })
  })
  it('다른 형식이나 깨진 파일은 거부한다', () => {
    expect(parseBackup('not json').ok).toBe(false)
    expect(parseBackup(JSON.stringify({ format: 'other', version: 2, settings: SETTINGS })).ok).toBe(false)
    expect(parseBackup(JSON.stringify({ ...createBackup(SETTINGS), version: 3 })).ok).toBe(false)
    expect(parseBackup(JSON.stringify(createBackup({ ...SETTINGS, fuelSheetName: ' ' }))).ok).toBe(false)
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
