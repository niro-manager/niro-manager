import type { Settings } from '../settings/settings'

/** 원본 쓰기 전환은 사용자 승인 후에만 true로 바꾼다(CLAUDE.md). */
export const ORIGINAL_WRITE_ENABLED = false

export type WriteGuard = { ok: true } | { ok: false; reason: string }

/** 쓰기 대상은 테스트용 복사본만 허용한다(원본 쓰기는 사용자 승인 전까지 비활성화). */
export function checkWriteAllowed(settings: Settings): WriteGuard {
  if (!settings.spreadsheetId) return { ok: false, reason: '설정에서 스프레드시트를 먼저 선택해 주세요.' }
  if (settings.target === 'original' && !ORIGINAL_WRITE_ENABLED) return { ok: false, reason: '원본 쓰기는 테스트용 복사본 검증과 사용자 승인 전까지 꺼져 있습니다.' }
  if (settings.target === 'copy' && !settings.spreadsheetName.includes('복사본')) {
    return { ok: false, reason: '테스트용 복사본으로 표시했지만 파일 이름에 "복사본"이 없습니다. 원본이 아닌지 확인해 주세요.' }
  }
  return { ok: true }
}
