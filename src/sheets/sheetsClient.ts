import type { CellValue } from '../domain/cells'

// Sheets 어댑터: 시트 읽기·쓰기와 오류 구분을 담당한다. UI는 이 모듈의 SheetsBackend를 통해서만 시트에 접근한다.
// 실제 구현은 Apps Script 웹 앱의 서버 함수(appsScriptBackend.ts, apps-script/Code.js)이다.

export type SheetsErrorKind = 'auth' | 'access' | 'notFound' | 'network' | 'api'

export class SheetsError extends Error {
  readonly kind: SheetsErrorKind

  constructor(kind: SheetsErrorKind, message: string) {
    super(message)
    this.name = 'SheetsError'
    this.kind = kind
  }
}

/** 탭 이름을 A1 표기용으로 감싼다. 작은따옴표는 두 번 쓴다. */
export function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

export interface SpreadsheetInfo {
  /** 웹 앱이 연결된(스크립트가 들어 있는) 스프레드시트 이름 */
  name: string
}

export interface SheetsBackend {
  getInfo(): Promise<SpreadsheetInfo>
  /** 여러 범위의 값을 계산 결과(UNFORMATTED_VALUE)와 날짜 직렬값으로 읽는다. 결과는 범위 순서와 같고 빈 범위는 빈 배열이다 */
  batchGetValues(ranges: string[]): Promise<CellValue[][][]>
  /** 탭 이름으로 숫자 sheetId를 찾는다. 없으면 null */
  getSheetId(sheetName: string): Promise<number | null>
  /** spreadsheets.batchUpdate. 요청들은 순서대로, 전부 적용되거나 전부 적용되지 않는다 */
  batchUpdate(requests: unknown[]): Promise<void>
}

export type SheetTarget = 'copy' | 'original'

/** 파일 이름에 "복사본"이 있으면 테스트용 복사본으로 본다 */
export function targetOf(spreadsheetName: string): SheetTarget {
  return spreadsheetName.includes('복사본') ? 'copy' : 'original'
}

/** 읽기·쓰기에 필요한 연결 정보: 백엔드, 파일 이름, 탭 이름 */
export interface SheetConnection {
  backend: SheetsBackend
  spreadsheetName: string
  fuelSheetName: string
  maintenanceSheetName: string
}
