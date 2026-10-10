import { describe, expect, it } from 'vitest'
import { parseDate, parseNumber, parseText } from './cells'

describe('parseDate', () => {
  it('Sheets 날짜 직렬값을 yyyy-mm-dd로 바꾼다', () => {
    expect(parseDate(45303)).toEqual({ ok: true, value: '2024-01-12' })
    expect(parseDate(60)).toEqual({ ok: true, value: '1900-02-28' })
  })
  it('시간이 포함된 직렬값은 날짜만 쓴다', () => {
    expect(parseDate(45303.75)).toEqual({ ok: true, value: '2024-01-12' })
  })
  it('yyyy-mm-dd 문자열을 받는다', () => {
    expect(parseDate(' 2025-02-28 ')).toEqual({ ok: true, value: '2025-02-28' })
  })
  it('빈 셀은 null, 잘못된 날짜는 실패', () => {
    expect(parseDate('')).toEqual({ ok: true, value: null })
    expect(parseDate(undefined)).toEqual({ ok: true, value: null })
    expect(parseDate('2025-02-30')).toEqual({ ok: false, raw: '2025-02-30' })
    expect(parseDate('어제')).toEqual({ ok: false, raw: '어제' })
  })
})

describe('parseNumber', () => {
  it('숫자와 통화 표시 문자열을 받는다', () => {
    expect(parseNumber(16)).toEqual({ ok: true, value: 16 })
    expect(parseNumber('₩1,507')).toEqual({ ok: true, value: 1507 })
    expect(parseNumber('31.746')).toEqual({ ok: true, value: 31.746 })
  })
  it('빈 셀은 0이 아니라 null', () => {
    expect(parseNumber('')).toEqual({ ok: true, value: null })
    expect(parseNumber(null)).toEqual({ ok: true, value: null })
  })
  it('0은 0으로 유지한다', () => {
    expect(parseNumber(0)).toEqual({ ok: true, value: 0 })
  })
  it('숫자가 아닌 값은 실패', () => {
    expect(parseNumber('7 일')).toEqual({ ok: false, raw: '7 일' })
  })
})

describe('parseText', () => {
  it('공백만 있으면 null', () => {
    expect(parseText('  ')).toBeNull()
    expect(parseText(' 메모 ')).toBe('메모')
  })
})
