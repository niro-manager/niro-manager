// 값이 없는 칸은 null이다. 0과 구분한다(AGENTS.md: 누락 값을 임의로 0으로 바꾸지 않음).

/** 시트1의 주유 기록 1행. `sheetRow`는 화면 표시·추적용이며 영구 식별자가 아니다. */
export interface FuelRecord {
  sheetRow: number
  date: string
  /** 원/리터 (C열) */
  unitPrice: number | null
  /** 리터 (D열) */
  liters: number | null
  /** 주유비, 원 (E열 계산 결과 또는 직접 입력값) */
  cost: number | null
  /** 누적 키로수 (G열) */
  odometerKm: number | null
  /** H열과 I열을 합친 비고 */
  memo: string | null
}

/** 시트2의 정비 1건. 첫 행(날짜가 있는 행)과 이어지는 항목 행을 묶는다. */
export interface MaintenanceRecord {
  sheetRow: number
  date: string
  items: string[]
  /** 업체/서비스 (C열) */
  vendor: string | null
  /** 정비 시점 누적 km (D열) */
  odometerKm: number | null
  /** 정비 1건 총액, 원 (E열). null은 미입력, 0은 무료 */
  cost: number | null
}

export interface RowWarning {
  sheetRow: number
  message: string
}

export interface ParseResult<T> {
  records: T[]
  warnings: RowWarning[]
}
