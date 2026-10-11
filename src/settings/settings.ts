// 브라우저(localStorage)에 저장하는 앱 설정과 백업·불러오기.
// 연결할 스프레드시트는 Apps Script가 들어 있는 파일로 정해지므로, 설정에는 탭 이름만 둔다.

export interface Settings {
  fuelSheetName: string
  maintenanceSheetName: string
}

export const DEFAULT_SETTINGS: Settings = {
  fuelSheetName: '시트1',
  maintenanceSheetName: '시트2',
}

export const SETTINGS_STORAGE_KEY = 'niro-manager.settings'
const BACKUP_FORMAT = 'niro-manager-settings'
const BACKUP_VERSION = 2
/** 이전(GitHub Pages) 백업. 스프레드시트 ID 등은 버리고 탭 이름만 쓴다 */
const LEGACY_BACKUP_VERSION = 1

export interface SettingsBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  settings: Settings
}

export type SettingsResult = { ok: true; settings: Settings } | { ok: false; error: string }

export function validateSettings(value: unknown): SettingsResult {
  if (typeof value !== 'object' || value === null) return { ok: false, error: '설정 형식이 올바르지 않습니다.' }
  const { fuelSheetName, maintenanceSheetName } = value as Record<string, unknown>
  if (typeof fuelSheetName !== 'string' || fuelSheetName.trim() === '') return { ok: false, error: '주유 탭 이름이 비어 있습니다.' }
  if (typeof maintenanceSheetName !== 'string' || maintenanceSheetName.trim() === '') return { ok: false, error: '정비 탭 이름이 비어 있습니다.' }
  return { ok: true, settings: { fuelSheetName: fuelSheetName.trim(), maintenanceSheetName: maintenanceSheetName.trim() } }
}

export function createBackup(settings: Settings, now: Date = new Date()): SettingsBackup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), settings }
}

export function parseBackup(json: string): SettingsResult {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return { ok: false, error: 'JSON 파일을 읽을 수 없습니다.' }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: '백업 파일 형식이 올바르지 않습니다.' }
  const backup = data as Record<string, unknown>
  if (backup.format !== BACKUP_FORMAT) return { ok: false, error: 'Niro Manager 설정 백업 파일이 아닙니다.' }
  if (backup.version !== BACKUP_VERSION && backup.version !== LEGACY_BACKUP_VERSION) {
    return { ok: false, error: `지원하지 않는 백업 버전입니다: ${String(backup.version)}` }
  }
  return validateSettings(backup.settings)
}

export function loadSettings(storage: Pick<Storage, 'getItem'> = localStorage): Settings {
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY)
    if (raw === null) return DEFAULT_SETTINGS
    const result = validateSettings(JSON.parse(raw))
    return result.ok ? result.settings : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 저장소를 쓸 수 없는 브라우저에서는 이번 실행 동안만 적용된다.
  }
}
