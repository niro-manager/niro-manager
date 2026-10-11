import { targetOf, type SheetConnection } from './sheetsClient'

/** 복사본 검증 후 사용자가 원본 저장 활성화를 승인했다(2026-10-11, CLAUDE.md). */
export const ORIGINAL_WRITE_ENABLED = true

export type WriteGuard = { ok: true } | { ok: false; reason: string }

/** 원본 쓰기가 잠겨 있으면 이름에 "복사본"이 있는 테스트용 복사본에만 쓴다. */
export function checkWriteAllowed(connection: Pick<SheetConnection, 'spreadsheetName'>): WriteGuard {
  if (targetOf(connection.spreadsheetName) === 'original' && !ORIGINAL_WRITE_ENABLED) {
    return { ok: false, reason: '원본 쓰기는 테스트용 복사본 검증과 사용자 승인 전까지 꺼져 있습니다.' }
  }
  return { ok: true }
}
