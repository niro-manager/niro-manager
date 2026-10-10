// 브라우저(localStorage)에 저장하는 앱 설정과 백업·불러오기.
// 배포 주소가 바뀌면 localStorage가 따라오지 않으므로 JSON 파일로 내보내고 불러온다(docs/PWA_GUIDE.md).
// 스프레드시트 ID는 저장소에 커밋하지 않고 여기에만 둔다.

export type SheetTarget = 'copy' | 'original'

export interface Settings {
  /** 연결할 스프레드시트 ID. 비어 있으면 미설정. Google Picker로 고른 파일만 읽을 수 있다 */
  spreadsheetId: string
  /** 화면 표시용 파일 이름 */
  spreadsheetName: string
  /** 연결한 시트가 테스트용 복사본인지 원본인지. 1단계는 읽기 전용이라 표시용이다 */
  target: SheetTarget
  fuelSheetName: string
  maintenanceSheetName: string
}

export const DEFAULT_SETTINGS: Settings = {
  spreadsheetId: '',
  spreadsheetName: '',
  target: 'copy',
  fuelSheetName: '시트1',
  maintenanceSheetName: '시트2',
}

export const SETTINGS_STORAGE_KEY = 'niro-manager.settings'
const BACKUP_FORMAT = 'niro-manager-settings'
const BACKUP_VERSION = 1
const SPREADSHEET_ID = /^[A-Za-z0-9_-]{20,100}$/

export interface SettingsBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  settings: Settings
}

export type SettingsResult = { ok: true; settings: Settings } | { ok: false; error: string }

export function validateSettings(value: unknown): SettingsResult {
  if (typeof value !== 'object' || value === null) return { ok: false, error: '설정 형식이 올바르지 않습니다.' }
  const v = value as Record<string, unknown>
  const { spreadsheetId, target, fuelSheetName, maintenanceSheetName } = v
  const spreadsheetName = v.spreadsheetName ?? ''
  if (typeof spreadsheetName !== 'string') return { ok: false, error: '파일 이름 형식이 올바르지 않습니다.' }
  if (typeof spreadsheetId !== 'string') return { ok: false, error: '스프레드시트 ID가 없습니다.' }
  if (spreadsheetId !== '' && !SPREADSHEET_ID.test(spreadsheetId)) return { ok: false, error: '스프레드시트 ID 형식이 올바르지 않습니다.' }
  if (target !== 'copy' && target !== 'original') return { ok: false, error: '연결 대상(복사본/원본) 값이 올바르지 않습니다.' }
  if (typeof fuelSheetName !== 'string' || fuelSheetName.trim() === '') return { ok: false, error: '주유 탭 이름이 비어 있습니다.' }
  if (typeof maintenanceSheetName !== 'string' || maintenanceSheetName.trim() === '') return { ok: false, error: '정비 탭 이름이 비어 있습니다.' }
  return {
    ok: true,
    settings: { spreadsheetId, spreadsheetName, target, fuelSheetName: fuelSheetName.trim(), maintenanceSheetName: maintenanceSheetName.trim() },
  }
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
  if (backup.version !== BACKUP_VERSION) return { ok: false, error: `지원하지 않는 백업 버전입니다: ${String(backup.version)}` }
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
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}
