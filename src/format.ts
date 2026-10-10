// 화면 표시 형식. 값이 없으면 대시를 보여 준다(0과 구분).
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const EMPTY = '—'

export function formatWon(value: number | null): string {
  return value === null ? EMPTY : `${Math.round(value).toLocaleString('ko-KR')}원`
}

export function formatLiters(value: number | null): string {
  return value === null ? EMPTY : `${value.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}L`
}

export function formatKm(value: number | null): string {
  return value === null ? EMPTY : `${value.toLocaleString('ko-KR')}km`
}

/** `yyyy-mm-dd`에 요일을 붙인다. */
export function formatDate(isoDate: string): string {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return `${isoDate} (${WEEKDAYS[weekday]})`
}

/** 기기 현지 시간 기준 오늘 `yyyy-mm-dd` */
export function today(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
