import { useState, type FormEvent } from 'react'
import { validateMaintenanceForm, type MaintenanceForm } from '../domain/maintenanceInput'
import { today, formatDate, formatKm, formatWon } from '../format'
import type { GoogleSession } from '../session/useGoogleSession'
import type { Settings } from '../settings/settings'
import { commitMaintenanceWrite, planMaintenanceWrite, type MaintenanceWritePlan, type MaintenanceWriteResult } from '../sheets/maintenanceWriter'
import { SheetsError } from '../sheets/sheetsClient'
import { Field } from './Field'

interface Props {
  settings: Settings
  session: GoogleSession
  onSaved: () => void
}

type Stage = { kind: 'form' } | { kind: 'confirm'; plan: MaintenanceWritePlan } | { kind: 'done'; result: MaintenanceWriteResult; plan: MaintenanceWritePlan }

const emptyForm = (): MaintenanceForm => ({ date: today(), items: [''], vendor: '', odometerKm: '', cost: '' })

export function MaintenanceEntryView({ settings, session, onSaved }: Props) {
  const [form, setForm] = useState<MaintenanceForm>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof MaintenanceForm, string>>>({})
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof MaintenanceForm>(key: K, value: MaintenanceForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setItem = (index: number, value: string) => setForm((f) => ({ ...f, items: f.items.map((item, i) => (i === index ? value : item)) }))
  const withToken = async () => session.token ?? (await session.signIn())
  const handleError = (e: unknown) => {
    if (e instanceof SheetsError && e.kind === 'auth') session.expire()
    setError(e instanceof Error ? e.message : '요청이 실패했습니다.')
  }

  const handleReview = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const result = validateMaintenanceForm(form)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    const token = await withToken()
    if (!token) return
    setBusy(true)
    try {
      setStage({ kind: 'confirm', plan: await planMaintenanceWrite(token, settings, result.input) })
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (plan: MaintenanceWritePlan) => {
    if (busy) return
    setError(null)
    const token = await withToken()
    if (!token) return
    setBusy(true)
    try {
      const result = await commitMaintenanceWrite(token, settings, plan)
      setStage({ kind: 'done', result, plan })
      onSaved()
    } catch (e) {
      handleError(e)
      setStage({ kind: 'form' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {stage.kind === 'done' && (
        <section className="card" role="status">
          <h2>저장했습니다</h2>
          <p>
            {stage.result.row}행부터 {stage.plan.input.items.length}행을 {stage.result.mode === 'insert' ? '끼워 넣고' : '추가하고'} 확인했습니다.
          </p>
          <Summary plan={stage.plan} />
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
          <Summary plan={stage.plan} />
          <p>
            {stage.plan.placement.mode === 'append'
              ? `${stage.plan.placement.row}행부터 ${stage.plan.input.items.length}행(마지막 기록 아래)에 추가합니다.`
              : `과거 날짜라 ${stage.plan.placement.row}행부터 ${stage.plan.input.items.length}행을 끼워 넣습니다. 아래 정비 ${stage.plan.shiftedRecords}건이 그만큼 내려갑니다.`}
          </p>
          {stage.plan.duplicate && (
            <p role="alert" className="message error">
              {stage.plan.duplicate.sheetRow}행에 같은 내용의 정비 기록이 이미 있습니다. 두 번 저장한 것이 아닌지 확인해 주세요.
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
          <h2>정비 입력</h2>
          <form className="form" onSubmit={handleReview} noValidate>
            <Field label="날짜" error={errors.date}>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </Field>
            <fieldset className="items">
              <legend>정비 항목</legend>
              {form.items.map((item, i) => (
                <div key={i} className="row">
                  <input type="text" aria-label={`항목 ${i + 1}`} value={item} onChange={(e) => setItem(i, e.target.value)} placeholder={i === 0 ? '엔진오일 교체' : ''} />
                  {form.items.length > 1 && (
                    <button type="button" className="secondary small" aria-label={`항목 ${i + 1} 삭제`} onClick={() => set('items', form.items.filter((_, j) => j !== i))}>
                      삭제
                    </button>
                  )}
                </div>
              ))}
              {errors.items && <span className="field-error">{errors.items}</span>}
              <button type="button" className="secondary small" onClick={() => set('items', [...form.items, ''])}>
                항목 추가
              </button>
            </fieldset>
            <Field label="업체 (선택)">
              <input type="text" value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
            </Field>
            <Field label="누적 km (선택)" error={errors.odometerKm}>
              <input inputMode="numeric" value={form.odometerKm} onChange={(e) => set('odometerKm', e.target.value)} />
            </Field>
            <Field label="총액 (원, 선택 · 무료면 0, 모르면 비움)" error={errors.cost}>
              <input inputMode="decimal" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
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

function Summary({ plan }: { plan: MaintenanceWritePlan }) {
  const { input } = plan
  return (
    <dl className="summary">
      <dt>날짜</dt>
      <dd>{formatDate(input.date)}</dd>
      <dt>항목</dt>
      <dd>{input.items.join(', ')}</dd>
      <dt>업체</dt>
      <dd>{input.vendor ?? '—'}</dd>
      <dt>누적 km</dt>
      <dd>{formatKm(input.odometerKm)}</dd>
      <dt>총액</dt>
      <dd>{input.cost === null ? '미입력' : input.cost === 0 ? '0원 (무료)' : formatWon(input.cost)}</dd>
    </dl>
  )
}
