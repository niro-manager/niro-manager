import { describe, expect, it } from 'vitest'
import type { FuelForm } from '../domain/fuelInput'
import type { MaintenanceForm } from '../domain/maintenanceInput'
import { clearDraft, loadDraft, saveDraft } from './drafts'

function memoryStorage() {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map }
}

const FUEL: FuelForm = { date: '2026-10-10', unitPrice: '1809', liters: '', manualCostEnabled: false, manualCost: '', odometerKm: '', memo: '' }
const MAINT: MaintenanceForm = { date: '2026-10-10', items: ['오일', ''], vendor: '', odometerKm: '', cost: '' }

describe('입력 임시 보관', () => {
  it('저장하고 복원한다', () => {
    const store = memoryStorage()
    saveDraft('fuel', FUEL, store)
    saveDraft('maintenance', MAINT, store)
    expect(loadDraft('fuel', store)).toEqual(FUEL)
    expect(loadDraft('maintenance', store)).toEqual(MAINT)
  })
  it('날짜만 있는 빈 양식은 보관하지 않고 기존 보관본도 지운다', () => {
    const store = memoryStorage()
    saveDraft('fuel', FUEL, store)
    saveDraft('fuel', { ...FUEL, unitPrice: '' }, store)
    expect(loadDraft('fuel', store)).toBeNull()
    saveDraft('maintenance', { ...MAINT, items: [' '] }, store)
    expect(loadDraft('maintenance', store)).toBeNull()
  })
  it('형식이 맞지 않으면 무시한다', () => {
    const store = memoryStorage()
    store.setItem('niro-manager.draft.fuel', '{broken')
    store.setItem('niro-manager.draft.maintenance', JSON.stringify({ date: 1, items: 'x' }))
    expect(loadDraft('fuel', store)).toBeNull()
    expect(loadDraft('maintenance', store)).toBeNull()
  })
  it('지운 종류만 삭제한다', () => {
    const store = memoryStorage()
    saveDraft('fuel', FUEL, store)
    saveDraft('maintenance', MAINT, store)
    clearDraft('fuel', store)
    expect(loadDraft('fuel', store)).toBeNull()
    expect(loadDraft('maintenance', store)).toEqual(MAINT)
  })
  it('저장소를 쓸 수 없어도 오류를 내지 않는다', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    expect(() => saveDraft('fuel', FUEL, broken)).not.toThrow()
    expect(loadDraft('fuel', broken)).toBeNull()
  })
})
