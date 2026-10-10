import { describe, expect, it } from 'vitest'
import { monthLabel, niceTicks } from './scale'

describe('niceTicks', () => {
  it('0부터 최댓값을 덮는 간격', () => {
    expect(niceTicks(0, 180000)).toEqual([0, 50000, 100000, 150000, 200000])
    expect(niceTicks(0, 87)).toEqual([0, 25, 50, 75, 100])
  })
  it('최솟값이 0이 아닌 범위(단가)', () => {
    expect(niceTicks(1500, 1990)).toEqual([1400, 1600, 1800, 2000])
  })
  it('값이 하나뿐이어도 범위를 만든다', () => {
    expect(niceTicks(0, 0)).toEqual([0, 1])
    expect(niceTicks(1600, 1600).length).toBeGreaterThan(1)
  })
})

describe('monthLabel', () => {
  it('1월과 첫 칸에는 연도를 붙인다', () => {
    expect(monthLabel('2025-01', false)).toBe('25.01')
    expect(monthLabel('2025-07', true)).toBe('25.07')
    expect(monthLabel('2025-07', false)).toBe('7월')
  })
})
