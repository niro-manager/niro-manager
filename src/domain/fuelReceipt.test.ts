import { describe, expect, it } from 'vitest'
import { fillFuelForm, parseFuelReceipt, sanitizeFuelReceipt, type FuelReceipt } from './fuelReceipt'
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

/** 실제 영수증 OCR 구조를 본뜬 표 양식(번호·값은 가짜). 머리글이 여러 줄로 나뉘고 품명 다음 줄에 숫자 행이 있다 */
const TABLE_SPLIT_HEADER = `1:0XX-XXX-XXXX TID: 0000000 NOZZLE NO: 03
거래일시: 2026년10월25일 20:07:12 거래번호: 99999 주유기번호: 03 유기번호: 03 탱크
제품명
수량 단가
금액
휘발유
16.000 1809 28,944
공급가:
26,313원
2,631원
부가세 :
*** 신용카드 승인정보 ***
카드 번호: 0000-00-0000`

/** 열 순서가 다른 표(단가 수량 금액), 머리글 한 줄 */
const TABLE_PRICE_FIRST = `샘플주유소
2026-09-12 08:00
품명 단가 수량 금액
경유 1,559 40.250 62,750
부가세 5,705`

/** 숫자 행이 여러 줄로 나뉜 표 */
const TABLE_SPLIT_ROW = `2026.08.01
유종 수량 단가 금액
고급휘발유
22.5
2,015
45,338`

/** 머리글 순서가 숫자와 맞지 않게 인식된 표: 단가×리터 ≈ 금액인 해석을 고른다 */
const TABLE_SHUFFLED_HEADER = `2026-07-20
금액
수량 단가
휘발유
30.000 1,650 49,500`

describe('parseFuelReceipt', () => {
  it.each<[string, string, FuelReceipt]>([
    ['SK', SK, { date: '2026-10-24', unitPrice: 1689, liters: 29.612, paid: 50015 }],
    ['GS(승인금액이 합계와 다름)', GS, { date: '2026-10-03', unitPrice: 1712, liters: 35.05, paid: 60000 }],
    ['S-OIL(리터×단가 한 줄)', SOIL, { date: '2026-09-30', unitPrice: 1699, liters: 23.68, paid: 40232 }],
    ['현대오일뱅크(값이 다음 줄)', HYUNDAI, { date: '2026-08-15', unitPrice: 1665, liters: 18.003, paid: 29975 }],
    ['알뜰(한글 날짜, 단가 줄에 "리터")', ALTTEUL, { date: '2026-07-02', unitPrice: 1598, liters: 41.32, paid: 66029 }],
    ['흐트러진 글자', NOISY, { date: '2026-10-01', unitPrice: 1705, liters: 20.1, paid: 34271 }],
    ['표: 머리글 여러 줄, 공급가·부가세 뒤따름', TABLE_SPLIT_HEADER, { date: '2026-10-25', unitPrice: 1809, liters: 16, paid: 28944 }],
    ['표: 단가 수량 금액 순서', TABLE_PRICE_FIRST, { date: '2026-09-12', unitPrice: 1559, liters: 40.25, paid: 62750 }],
    ['표: 숫자 행이 여러 줄', TABLE_SPLIT_ROW, { date: '2026-08-01', unitPrice: 2015, liters: 22.5, paid: 45338 }],
    ['표: 머리글 순서가 어긋남', TABLE_SHUFFLED_HEADER, { date: '2026-07-20', unitPrice: 1650, liters: 30, paid: 49500 }],
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

  it('표의 금액보다 결제·승인 금액을 우선한다', () => {
    expect(parseFuelReceipt(`${TABLE_SPLIT_HEADER}\n승인금액 28,900`).paid).toBe(28900)
  })

  it('공급가·부가세만 있으면 결제 금액으로 잡지 않는다', () => {
    expect(parseFuelReceipt('공급가:\n26,313원\n부가세 :\n2,631원').paid).toBeNull()
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

describe('sanitizeFuelReceipt', () => {
  it('범위 안의 값은 그대로 쓰고 리터는 소수 3자리로 맞춘다', () => {
    expect(sanitizeFuelReceipt({ date: '2026-10-25', unitPrice: 1809, liters: 16.00049, paid: 28944 })).toEqual({
      date: '2026-10-25',
      unitPrice: 1809,
      liters: 16,
      paid: 28944,
    })
  })

  it('문자열·범위 밖 값·없는 날짜는 null', () => {
    expect(sanitizeFuelReceipt({ date: '2026-02-30', unitPrice: '1809', liters: 999, paid: 100 })).toEqual({
      date: null,
      unitPrice: null,
      liters: null,
      paid: null,
    })
    expect(sanitizeFuelReceipt({})).toEqual({ date: null, unitPrice: null, liters: null, paid: null })
  })
})
