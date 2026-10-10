import { describe, expect, it } from 'vitest'
import { REFRESH_AFTER_MS, isStale } from './useLogbook'

describe('isStale', () => {
  const logbook = (loadedAt: number) => ({ fuel: [], maintenance: [], fuelWarnings: [], maintenanceWarnings: [], loadedAt: new Date(loadedAt) })
  it('읽은 적이 없거나 5분이 지나면 다시 읽는다', () => {
    expect(isStale(null)).toBe(true)
    expect(isStale(logbook(0), REFRESH_AFTER_MS - 1)).toBe(false)
    expect(isStale(logbook(0), REFRESH_AFTER_MS)).toBe(true)
  })
})
