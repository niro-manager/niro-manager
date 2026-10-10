import { useState, type FormEvent } from 'react'
import { expectedCost, validateFuelForm, type FuelForm } from '../domain/fuelInput'
import { today, formatDate, formatKm, formatLiters, formatWon } from '../format'
import type { GoogleSession } from '../session/useGoogleSession'
import type { Settings } from '../settings/settings'
import { commitFuelWrite, planFuelWrite, type FuelWritePlan, type FuelWriteResult } from '../sheets/fuelWriter'
import { Field } from './Field'
import { SheetsError } from '../sheets/sheetsClient'

interface Props {
  settings: Settings
  session: GoogleSession
  /** 저장 후 기록을 다시 읽게 한다 */
  onSaved: () => void
}

type Stage = { kind: 'form' } | { kind: 'confirm'; plan: FuelWritePlan } | { kind: 'done'; result: FuelWriteResult; plan: FuelWritePlan }

const emptyForm = (): FuelForm => ({ date: today(), unitPrice: '', liters: '', manualCostEnabled: false, manualCost: '', odometerKm: '', memo: '' })

export function FuelEntryView({ settings, session, onSaved }: Props) {
  const [form, setForm] = useState<FuelForm>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof FuelForm, string>>>({})
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FuelForm>(key: K, value: FuelForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  const withToken = async (): Promise<string | null> => session.token ?? (await session.signIn())

  const handleError = (e: unknown) => {
    if (e instanceof SheetsError && e.kind === 'auth') session.expire()
    setError(e instanceof Error ? e.message : '요청이 실패했습니다.')
  }

  const handleReview = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const result = validateFuelForm(form)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    const token = await withToken()
    if (!token) return
    setBusy(true)
    try {
      setStage({ kind: 'confirm', plan: await planFuelWrite(token, settings, result.input) })
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (plan: FuelWritePlan) => {
    if (busy) return
    setError(null)
    const token = await withToken()
    if (!token) return
    setBusy(true)
    try {
      const result = await commitFuelWrite(token, settings, plan)
      setStage({ kind: 'done', result, plan })
      onSaved()
    } catch (e) {
      handleError(e)
      setStage({ kind: 'form' })
    } finally {
      setBusy(false)
    }
  }

  const preview = form.manualCostEnabled ? null : validateFuelForm({ ...form, memo: '' })
  const autoCost = preview?.ok ? expectedCost(preview.input) : null

  return (
    <>
      {stage.kind === 'done' && (
        <section className="card" role="status">
          <h2>저장했습니다</h2>
          <p>
            {stage.result.row}행에 {stage.result.mode === 'insert' ? '끼워 넣고 확인했습니다.' : '추가하고 확인했습니다.'}
          </p>
          <RecordSummary plan={stage.plan} />
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm())
              setStage({ kind: 'form' })
            }}
          >
            새 기록 입력
          </button>
        </section>
      )}

      {stage.kind === 'confirm' && (
        <section className="card">
          <h2>저장 전 확인</h2>
          <RecordSummary plan={stage.plan} />
          <p>
            {stage.plan.placement.mode === 'append'
              ? `${stage.plan.placement.row}행(마지막 기록 아래)에 추가합니다.`
              : `과거 날짜라 ${stage.plan.placement.row}행에 끼워 넣습니다. 아래 기록 ${stage.plan.shiftedRecords}건이 한 칸씩 내려가고, 다음 기록의 경과일수를 다시 계산합니다.`}
          </p>
          {stage.plan.duplicate && (
            <p role="alert" className="message error">
              {stage.plan.duplicate.sheetRow}행에 같은 내용의 기록이 이미 있습니다. 두 번 저장한 것이 아닌지 확인해 주세요.
            </p>
          )}
          <div className="row">
            <button type="button" onClick={() => void handleSave(stage.plan)} disabled={busy}>
              {busy ? '저장 중…' : stage.plan.duplicate ? '그래도 저장' : '저장'}
            </button>
            <button type="button" className="secondary" onClick={() => setStage({ kind: 'form' })} disabled={busy}>
              고치기
            </button>
          </div>
        </section>
      )}

      {stage.kind === 'form' && (
        <section className="card">
          <h2>주유 입력</h2>
          <form className="form" onSubmit={handleReview} noValidate>
            <Field label="날짜" error={errors.date}>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </Field>
            <div className="grid-2">
              <Field label="단가 (원/L)" error={errors.unitPrice}>
                <input inputMode="decimal" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="1809" />
              </Field>
              <Field label="리터" error={errors.liters}>
                <input inputMode="decimal" value={form.liters} onChange={(e) => set('liters', e.target.value)} placeholder="16" />
              </Field>
            </div>
            <div className="computed">
              주유비 {form.manualCostEnabled ? '직접 입력' : autoCost === null ? '—' : `${formatWon(autoCost)} (단가×리터)`}
            </div>
            <label className="inline">
              <input type="checkbox" checked={form.manualCostEnabled} onChange={(e) => set('manualCostEnabled', e.target.checked)} /> 결제액이 단가×리터와 다름(상품권 등)
            </label>
            {form.manualCostEnabled && (
              <Field label="결제 금액 (원)" error={errors.manualCost}>
                <input inputMode="decimal" value={form.manualCost} onChange={(e) => set('manualCost', e.target.value)} placeholder="50000" />
              </Field>
            )}
            <Field label="누적 km (선택)" error={errors.odometerKm}>
              <input inputMode="numeric" value={form.odometerKm} onChange={(e) => set('odometerKm', e.target.value)} />
            </Field>
            <Field label="비고 (선택)">
              <input type="text" value={form.memo} onChange={(e) => set('memo', e.target.value)} />
            </Field>
            <button type="submit" disabled={busy || session.signingIn}>
              {busy ? '시트 확인 중…' : '확인'}
            </button>
          </form>
        </section>
      )}

      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
    </>
  )
}

function RecordSummary({ plan }: { plan: FuelWritePlan }) {
  const { input } = plan
  return (
    <dl className="summary">
      <dt>날짜</dt>
      <dd>{formatDate(input.date)}</dd>
      <dt>주유비</dt>
      <dd>
        {formatWon(expectedCost(input))}
        {input.manualCost !== null && ' (직접 입력)'}
      </dd>
      <dt>리터 · 단가</dt>
      <dd>
        {formatLiters(input.liters)} · {formatWon(input.unitPrice)}
      </dd>
      <dt>누적 km</dt>
      <dd>{formatKm(input.odometerKm)}</dd>
      {input.memo && (
        <>
          <dt>비고</dt>
          <dd>{input.memo}</dd>
        </>
      )}
    </dl>
  )
}
