import { describe, expect, it } from 'vitest'
import { fillFuelForm, parseFuelReceipt, type FuelReceipt } from './fuelReceipt'
import type { FuelForm } from './fuelInput'

// 주요 주유소 영수증 양식을 흉내 낸 가짜 OCR 글자. 실제 영수증·개인정보가 아니다(상호·번호는 지어낸 값).
const SK = `SK에너지
행복주유소
사업자번호 123-45-67890
TEL 02-123-4567
거래일시 2026-10-24 14:23:05
유종: 휘발유
단가: 1,689원
수량: 29.612L
금액: 50,015원
카드번호 1234-56**-****-7890
승인번호 12345678
결제금액: 50,015원`

const GS = `GS칼텍스 (주)샘플에너지 샘플주유소
2026/10/03 09:12
제품명 휘발유
단 가 1,712
수량(L) 35.050
금 액 60,006
합 계 60,006
부가세 5,455
신용승인
승인금액 60,000
포인트 적립 60`

const SOIL = `S-OIL 샘플셀프주유소
일시 26.09.30 18:40
보통휘발유
23.680 ℓ x 1,699 = 40,232
받을금액 40,232원
공급가액 36,575
부가세 3,657`

const HYUNDAI = `현대오일뱅크 샘플직영
거래일자 2026.08.15
유 종 휘발유
주유량 18.003 ℓ
단 가 1,665원/ℓ
판매금액 29,975
결제금액
29,975
보너스카드 적립 29`

const ALTTEUL = `알뜰주유소 샘플농협
2026년 7월 2일 (목) 08:05
리터
41.32
단가(원/리터)
1,598
총금액
66,029
현금영수증 승인`

/** 표 모양이 흐트러져 이름과 값이 다른 줄로 나뉘고, 숫자 사이에 공백이 들어간 경우 */
const NOISY = `ＳＫ 엔크린 샘플
거 래 일 시
2026 - 10 - 01 07:31
단가
1 ,705
수량
20 . 100
결 제 금 액
34 ,271`

describe('parseFuelReceipt', () => {
  it.each<[string, string, FuelReceipt]>([
    ['SK', SK, { date: '2026-10-24', unitPrice: 1689, liters: 29.612, paid: 50015 }],
    ['GS(승인금액이 합계와 다름)', GS, { date: '2026-10-03', unitPrice: 1712, liters: 35.05, paid: 60000 }],
    ['S-OIL(리터×단가 한 줄)', SOIL, { date: '2026-09-30', unitPrice: 1699, liters: 23.68, paid: 40232 }],
    ['현대오일뱅크(값이 다음 줄)', HYUNDAI, { date: '2026-08-15', unitPrice: 1665, liters: 18.003, paid: 29975 }],
    ['알뜰(한글 날짜, 단가 줄에 "리터")', ALTTEUL, { date: '2026-07-02', unitPrice: 1598, liters: 41.32, paid: 66029 }],
    ['흐트러진 글자', NOISY, { date: '2026-10-01', unitPrice: 1705, liters: 20.1, paid: 34271 }],
  ])('%s', (_name, text, expected) => {
    expect(parseFuelReceipt(text)).toEqual(expected)
  })

  it('찾지 못한 값은 null', () => {
    expect(parseFuelReceipt('샘플마트\n감사합니다')).toEqual({ date: null, unitPrice: null, liters: null, paid: null })
  })

  it('전화번호·사업자번호를 날짜로 읽지 않는다', () => {
    expect(parseFuelReceipt('TEL 02-12-3456\n사업자 123-45-67890').date).toBeNull()
  })

  it('없는 날짜는 버린다', () => {
    expect(parseFuelReceipt('거래일시 2026-02-30').date).toBeNull()
  })

  it('부가세·할인·포인트 금액은 결제 금액으로 쓰지 않는다', () => {
    expect(parseFuelReceipt('할인금액 1,000\n부가세 4,545\n포인트 잔액 3,000').paid).toBeNull()
  })

  it('범위를 벗어난 단가·리터는 버린다', () => {
    expect(parseFuelReceipt('단가 12\n수량 999.5').unitPrice).toBeNull()
    expect(parseFuelReceipt('단가 12\n수량 999.5').liters).toBeNull()
  })
})

const form = (overrides: Partial<FuelForm> = {}): FuelForm => ({
  date: '2026-10-25',
  unitPrice: '1500',
  liters: '10',
  manualCostEnabled: false,
  manualCost: '',
  odometerKm: '12345',
  memo: '메모',
  ...overrides,
})

describe('fillFuelForm', () => {
  it('결제 금액이 단가×리터(원 단위 반올림)와 같으면 수식으로 둔다', () => {
    // 1689 × 29.612 = 50014.668 → 50,015원
    const result = fillFuelForm(form(), { date: '2026-10-24', unitPrice: 1689, liters: 29.612, paid: 50015 })
    expect(result.form).toEqual(form({ date: '2026-10-24', unitPrice: '1689', liters: '29.612' }))
    expect(result.filled).toEqual(['date', 'unitPrice', 'liters'])
    expect(result.missing).toEqual([])
  })

  it('결제 금액이 다르면 "결제액이 다름"을 켜고 금액을 넣는다', () => {
    const result = fillFuelForm(form(), { date: '2026-10-03', unitPrice: 1712, liters: 35.05, paid: 60000 })
    expect(result.form).toMatchObject({ manualCostEnabled: true, manualCost: '60000' })
    expect(result.filled).toContain('manualCost')
  })

  it('찾지 못한 단가·리터·금액은 비우고 날짜·누적 km·비고는 그대로 둔다', () => {
    const result = fillFuelForm(form({ manualCostEnabled: true, manualCost: '9' }), { date: null, unitPrice: null, liters: 30, paid: null })
    expect(result.form).toEqual(form({ unitPrice: '', liters: '30' }))
    expect(result.filled).toEqual(['liters'])
    expect(result.missing).toEqual(['date', 'unitPrice', 'paid'])
  })

  it('단가·리터 없이 금액만 찾으면 결제 금액으로 넣는다', () => {
    const result = fillFuelForm(form(), { date: null, unitPrice: null, liters: null, paid: 30000 })
    expect(result.form).toMatchObject({ unitPrice: '', liters: '', manualCostEnabled: true, manualCost: '30000' })
  })

  it('리터는 소수점 아래 3자리까지', () => {
    expect(fillFuelForm(form(), { date: null, unitPrice: null, liters: 12.3456, paid: null }).form.liters).toBe('12.346')
  })
})
