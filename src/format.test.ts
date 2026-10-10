import { describe, expect, it } from 'vitest'
import { formatDate, formatKm, formatLiters, formatWon } from './format'

describe('format', () => {
  it('값이 없으면 대시, 0은 0으로 보여 준다', () => {
    expect(formatWon(null)).toBe('—')
    expect(formatWon(0)).toBe('0원')
    expect(formatLiters(null)).toBe('—')
    expect(formatKm(null)).toBe('—')
  })
  it('금액은 원 단위 반올림, 리터는 소수 3자리까지', () => {
    expect(formatWon(49999.95)).toBe('50,000원')
    expect(formatLiters(31.746)).toBe('31.746L')
    expect(formatKm(58241)).toBe('58,241km')
  })
  it('날짜에 요일을 붙인다', () => {
    expect(formatDate('2024-01-12')).toBe('2024-01-12 (금)')
  })
})
