import type { Settings } from '../settings/settings'

/** 복사본 검증 후 사용자가 원본 저장 활성화를 승인했다(2026-10-11, CLAUDE.md). */
export const ORIGINAL_WRITE_ENABLED = true

export type WriteGuard = { ok: true } | { ok: false; reason: string }

/** 선택한 원본 또는 이름이 확인된 테스트용 복사본에만 쓴다. */
export function checkWriteAllowed(settings: Settings): WriteGuard {
  if (!settings.spreadsheetId) return { ok: false, reason: '설정에서 스프레드시트를 먼저 선택해 주세요.' }
  if (settings.target === 'original' && !ORIGINAL_WRITE_ENABLED) return { ok: false, reason: '원본 쓰기는 테스트용 복사본 검증과 사용자 승인 전까지 꺼져 있습니다.' }
  if (settings.target === 'copy' && !settings.spreadsheetName.includes('복사본')) {
    return { ok: false, reason: '테스트용 복사본으로 표시했지만 파일 이름에 "복사본"이 없습니다. 원본이 아닌지 확인해 주세요.' }
  }
  return { ok: true }
}
