import type { FuelForm } from '../domain/fuelInput'
import type { MaintenanceForm } from '../domain/maintenanceInput'

// 저장하지 않은 입력 중인 내용(주유·정비 각 한 건)만 임시 보관한다(2026-10-10 합의, 오프라인 A+).
// 시트 기록 자체는 기기에 저장하지 않는다. 자동 저장은 하지 않는다.

const KEYS = { fuel: 'niro-manager.draft.fuel', maintenance: 'niro-manager.draft.maintenance' } as const
export type DraftKind = keyof typeof KEYS

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(): DraftStorage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

const isString = (v: unknown): v is string => typeof v === 'string'

function isFuelForm(v: unknown): v is FuelForm {
  if (typeof v !== 'object' || v === null) return false
  const f = v as Record<string, unknown>
  return [f.date, f.unitPrice, f.liters, f.manualCost, f.odometerKm, f.memo].every(isString) && typeof f.manualCostEnabled === 'boolean'
}

function isMaintenanceForm(v: unknown): v is MaintenanceForm {
  if (typeof v !== 'object' || v === null) return false
  const f = v as Record<string, unknown>
  return [f.date, f.vendor, f.odometerKm, f.cost].every(isString) && Array.isArray(f.items) && f.items.length > 0 && f.items.every(isString)
}

/** 날짜 외에 입력한 내용이 있는지. 빈 양식은 보관하지 않는다 */
export function hasContent(form: FuelForm | MaintenanceForm): boolean {
  if ('items' in form) return form.items.some((i) => i.trim() !== '') || [form.vendor, form.odometerKm, form.cost].some((v) => v.trim() !== '')
  return [form.unitPrice, form.liters, form.manualCost, form.odometerKm, form.memo].some((v) => v.trim() !== '')
}

export function loadDraft(kind: 'fuel', store?: DraftStorage | null): FuelForm | null
export function loadDraft(kind: 'maintenance', store?: DraftStorage | null): MaintenanceForm | null
export function loadDraft(kind: DraftKind, store: DraftStorage | null = storage()): FuelForm | MaintenanceForm | null {
  try {
    const raw = store?.getItem(KEYS[kind])
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (kind === 'fuel' ? !isFuelForm(data) : !isMaintenanceForm(data)) return null
    const form = data as FuelForm | MaintenanceForm
    return hasContent(form) ? form : null
  } catch {
    return null
  }
}

/** 입력 내용이 있으면 보관하고, 없으면 지운다 */
export function saveDraft(kind: DraftKind, form: FuelForm | MaintenanceForm, store: DraftStorage | null = storage()): void {
  try {
    if (hasContent(form)) store?.setItem(KEYS[kind], JSON.stringify(form))
    else store?.removeItem(KEYS[kind])
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 보관하지 않는다
  }
}

export function clearDraft(kind: DraftKind, store: DraftStorage | null = storage()): void {
  try {
    store?.removeItem(KEYS[kind])
  } catch {
    // 무시
  }
}

export function clearAllDrafts(store: DraftStorage | null = storage()): void {
  clearDraft('fuel', store)
  clearDraft('maintenance', store)
}
