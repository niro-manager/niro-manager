import { describe, expect, it } from 'vitest'
import { fallbackMessage, paidReferenceMessage } from './receiptMessages'

describe('fallbackMessage', () => {
  it.each([
    ['no-key', null, 'Gemini 키가 설정되지 않아 Drive 인식으로 읽었습니다.'],
    ['quota', 429, 'Gemini 무료 사용 한도를 넘어(HTTP 429) Drive 인식으로 읽었습니다.'],
    ['failed', 404, 'Gemini 요청이 실패해(HTTP 404) Drive 인식으로 읽었습니다.'],
    ['failed', null, 'Gemini 요청이 실패해 Drive 인식으로 읽었습니다.'],
    ['failed', 200, 'Gemini 응답을 해석하지 못해 Drive 인식으로 읽었습니다.'],
    ['network', null, 'Gemini에 연결하지 못해 Drive 인식으로 읽었습니다.'],
  ] as const)('%s (%s)', (fallback, geminiStatus, message) => {
    expect(fallbackMessage({ engine: 'drive', fallback, geminiStatus })).toBe(message)
  })

  it('Gemini로 읽었거나 이유가 없으면 null', () => {
    expect(fallbackMessage({ engine: 'gemini', fallback: null, geminiStatus: null })).toBeNull()
    expect(fallbackMessage({ engine: 'drive', fallback: null, geminiStatus: null })).toBeNull()
  })
})

describe('paidReferenceMessage', () => {
  it('결제액을 원 단위로 보여 준다', () => {
    expect(paidReferenceMessage(32310)).toBe('영수증 결제액 32,310원 — 단가·리터를 입력하면 주유비가 계산됩니다.')
  })
})
