import { describe, expect, it } from 'vitest'
import { fitWithin } from './receiptImage'

describe('fitWithin', () => {
  it('긴 변을 1600px로 줄이고 비율을 유지한다', () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 })
  })

  it('작은 사진은 키우지 않는다', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})
