import type { FuelForm } from './fuelInput'

// 주유 영수증 사진의 글자 인식(OCR) 결과에서 날짜·단가·리터·결제 금액을 찾는다(2026-10-25 합의).
// 인식이 틀릴 수 있으므로 입력 칸만 채우고, 저장은 사용자가 확인 화면에서 직접 한다.
// 카드번호·승인번호 등 다른 내용은 찾거나 보관하지 않는다.

export interface FuelReceipt {
  /** `yyyy-mm-dd` */
  date: string | null
  /** 원/L */
  unitPrice: number | null
  /** L, 소수점 아래 3자리까지 */
  liters: number | null
  /** 실제 결제(받을) 금액, 원 */
  paid: number | null
}

export type ReceiptField = 'date' | 'unitPrice' | 'liters' | 'paid'

export const RECEIPT_FIELD_LABELS: Record<ReceiptField, string> = {
  date: '날짜',
  unitPrice: '단가',
  liters: '리터',
  paid: '결제 금액',
}

// 값이 이 범위를 벗어나면 다른 숫자(사업자번호, 포인트 등)를 잘못 읽은 것으로 본다.
const UNIT_PRICE_RANGE = [300, 5000] as const
const LITERS_RANGE = [0.5, 300] as const
const PAID_RANGE = [500, 2_000_000] as const

/** OCR이 글자 사이에 공백을 넣는 경우("단 가", "금 액")도 찾도록 글자 사이 공백을 허용한다 */
function spaced(word: string): string {
  return [...word].join('\\s*')
}

function keywords(words: string[]): RegExp {
  return new RegExp(`(?:${words.map(spaced).join('|')})`)
}

const DATE_KEYWORD = keywords(['거래일시', '거래일자', '판매일시', '판매일자', '거래일', '일시', '일자', '날짜'])
const UNIT_PRICE_KEYWORD = keywords(['단가'])
const LITERS_KEYWORD = keywords(['주유량', '수량', '리터', '용량'])
// 앞에 있을수록 실제로 낸 돈에 가깝다.
const PAID_KEYWORDS = [
  keywords(['결제금액', '승인금액', '받을금액', '받은금액', '결제액', '청구금액']),
  keywords(['합계금액', '총금액', '총액', '합계', '총계']),
  keywords(['판매금액', '주유금액', '금액']),
]
// 이런 줄의 금액은 결제 금액이 아니다.
const NOT_PAID = keywords(['부가세', '부가가치세', '공급가', '과세', '면세', '할인', '포인트', '적립', '잔액', '잔여', '거스름', '단가', '보너스'])

/** 전각 숫자·기호, ℓ 등을 일반 글자로 바꾸고 줄 단위로 나눈다 */
function lines(text: string): string[] {
  return text
    .normalize('NFKC')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line !== '')
}

/** 금액·단가: "50,015", "50.015", "50 ,015", "1,689원" → 정수. 천 단위 구분 기호만 허용 */
function wonValues(text: string): number[] {
  const out: number[] = []
  for (const match of text.matchAll(/(?<![\d.,])(\d{1,3}(?:\s?[,.]\s?\d{3})+|\d+)(?![\d]|[.,]\d)/g)) {
    out.push(Number(match[1]!.replace(/[\s,.]/g, '')))
  }
  return out
}

/** 리터: "29.612", "29,612"(쉼표로 잘못 읽은 소수점), "30" → 수. 소수점 아래 3자리까지 */
function literValues(text: string): number[] {
  const out: number[] = []
  for (const match of text.matchAll(/(?<![\d.,])(\d{1,3})(?:\s?[.,]\s?(\d{1,3}))?(?![\d])/g)) {
    out.push(Number(match[2] === undefined ? match[1] : `${match[1]}.${match[2]}`))
  }
  return out
}

const inRange = (value: number, [min, max]: readonly [number, number]) => value >= min && value <= max

/**
 * 키워드가 있는 줄에서 키워드 뒤의 값을 찾고, 그 줄에 값이 없으면 다음 줄을 본다
 * (표 모양 영수증은 이름과 값이 다른 줄로 인식되기도 한다).
 */
function valueAfterKeyword(
  all: string[],
  keyword: RegExp,
  read: (text: string) => number[],
  range: readonly [number, number],
  skip?: RegExp,
): number | null {
  for (let i = 0; i < all.length; i++) {
    const line = all[i]!
    const match = keyword.exec(line)
    if (!match || (skip && skip.test(line))) continue
    const rest = line.slice(match.index + match[0].length)
    const found = read(rest).find((v) => inRange(v, range))
    if (found !== undefined) return found
    if (read(rest).length === 0 && i + 1 < all.length && !(skip && skip.test(all[i + 1]!))) {
      const next = read(all[i + 1]!).find((v) => inRange(v, range))
      if (next !== undefined) return next
    }
  }
  return null
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const FULL_DATE = /(?<!\d)(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/g
const SHORT_DATE = /(?<![\d.\-/])(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?![\d.\-/])/g

function datesIn(line: string): string[] {
  const out: string[] = []
  for (const m of line.matchAll(FULL_DATE)) {
    const iso = isoDate(Number(m[1]), Number(m[2]), Number(m[3]))
    if (iso) out.push(iso)
  }
  if (out.length > 0) return out
  for (const m of line.matchAll(SHORT_DATE)) {
    const iso = isoDate(2000 + Number(m[1]), Number(m[2]), Number(m[3]))
    if (iso) out.push(iso)
  }
  return out
}

function findDate(all: string[]): string | null {
  const keyed = all.filter((line) => DATE_KEYWORD.test(line)).flatMap(datesIn)
  return keyed[0] ?? all.flatMap(datesIn)[0] ?? null
}

/** "29.612L x 1,689 = 50,015"처럼 한 줄에 리터×단가가 있는 양식 */
function findMultiplication(all: string[]): { liters: number; unitPrice: number } | null {
  for (const line of all) {
    const m = /(\d{1,3}(?:\s?[.,]\s?\d{1,3})?)\s*(?:l|L|리터)?\s*[xX×*]\s*(\d{1,3}(?:\s?,\s?\d{3})+|\d{3,4})/.exec(line)
    if (!m) continue
    const liters = literValues(m[1]!)[0]
    const unitPrice = wonValues(m[2]!)[0]
    if (liters !== undefined && unitPrice !== undefined && inRange(liters, LITERS_RANGE) && inRange(unitPrice, UNIT_PRICE_RANGE)) {
      return { liters, unitPrice }
    }
  }
  return null
}

/** 숫자 바로 뒤에 L·리터가 붙은 값("29.612L", "29.612 ℓ") */
function findLitersBySuffix(all: string[]): number | null {
  for (const line of all) {
    for (const m of line.matchAll(/(?<![\d.,])(\d{1,3}(?:\s?[.,]\s?\d{1,3})?)\s*(?:l|L|리터)(?![a-zA-Z가-힣])/g)) {
      const value = literValues(m[1]!)[0]
      if (value !== undefined && inRange(value, LITERS_RANGE)) return value
    }
  }
  return null
}

/** OCR 글자에서 주유 기록 값을 찾는다. 못 찾은 값은 null */
export function parseFuelReceipt(text: string): FuelReceipt {
  const all = lines(text)
  const multiplication = findMultiplication(all)
  const unitPrice = valueAfterKeyword(all, UNIT_PRICE_KEYWORD, wonValues, UNIT_PRICE_RANGE) ?? multiplication?.unitPrice ?? null
  const liters =
    valueAfterKeyword(all, LITERS_KEYWORD, literValues, LITERS_RANGE, UNIT_PRICE_KEYWORD) ?? multiplication?.liters ?? findLitersBySuffix(all)
  let paid: number | null = null
  for (const keyword of PAID_KEYWORDS) {
    paid = valueAfterKeyword(all, keyword, wonValues, PAID_RANGE, NOT_PAID)
    if (paid !== null) break
  }
  return { date: findDate(all), unitPrice, liters, paid }
}

export interface ReceiptFill {
  form: FuelForm
  /** 영수증에서 읽어 채운 입력 칸 */
  filled: (keyof FuelForm)[]
  /** 영수증에서 찾지 못한 값 */
  missing: ReceiptField[]
}

/**
 * 영수증에서 읽은 값으로 주유 입력 칸을 채운다.
 * - 찾은 날짜·단가·리터는 덮어쓰고, 찾지 못한 단가·리터·결제 금액은 비운다(날짜는 그대로 둔다).
 * - 누적 km·비고는 영수증에 없으므로 그대로 둔다.
 * - 결제 금액이 단가×리터(원 단위 반올림)와 다르거나, 단가·리터를 못 찾아 비교할 수 없으면 "결제액이 다름"을 켜고 금액을 넣는다.
 */
export function fillFuelForm(form: FuelForm, receipt: FuelReceipt): ReceiptFill {
  const next: FuelForm = { ...form, unitPrice: '', liters: '', manualCostEnabled: false, manualCost: '' }
  const filled: (keyof FuelForm)[] = []
  if (receipt.date !== null) {
    next.date = receipt.date
    filled.push('date')
  }
  if (receipt.unitPrice !== null) {
    next.unitPrice = String(receipt.unitPrice)
    filled.push('unitPrice')
  }
  if (receipt.liters !== null) {
    next.liters = String(Math.round(receipt.liters * 1000) / 1000)
    filled.push('liters')
  }
  if (receipt.paid !== null) {
    const computed = receipt.unitPrice !== null && receipt.liters !== null ? Math.round(receipt.unitPrice * receipt.liters) : null
    if (computed !== receipt.paid) {
      next.manualCostEnabled = true
      next.manualCost = String(receipt.paid)
      filled.push('manualCost')
    }
  }
  const missing = (Object.keys(RECEIPT_FIELD_LABELS) as ReceiptField[]).filter((field) => receipt[field] === null)
  return { form: next, filled, missing }
}
