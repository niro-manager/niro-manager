import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { expectedCost, validateFuelForm, type FuelForm } from '../domain/fuelInput'
import { RECEIPT_FIELD_LABELS, fillFuelForm, parseFuelReceipt, type ReceiptField } from '../domain/fuelReceipt'
import { today, formatDate, formatKm, formatLiters, formatWon } from '../format'
import type { SheetConnection } from '../sheets/sheetsClient'
import { commitFuelWrite, planFuelWrite, type FuelWritePlan, type FuelWriteResult } from '../sheets/fuelWriter'
import { clearDraft, loadDraft, saveDraft } from './drafts'
import { OFFLINE_MESSAGE, isOffline } from './offline'
import { DraftNotice, Field } from './Field'
import { prepareReceiptImage } from './receiptImage'

interface Props {
  connection: SheetConnection
  /** 저장 후 기록을 다시 읽게 한다 */
  onSaved: () => void
}

type Stage = { kind: 'form' } | { kind: 'confirm'; plan: FuelWritePlan } | { kind: 'done'; result: FuelWriteResult; plan: FuelWritePlan }

/** 영수증 사진 읽기 상태. 인식한 글자는 화면에만 두고 저장하지 않는다 */
type ReceiptScan =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'read'; text: string; missing: ReceiptField[]; tempFileLeft: boolean }
  | { kind: 'error'; message: string }

const emptyForm = (): FuelForm => ({ date: today(), unitPrice: '', liters: '', manualCostEnabled: false, manualCost: '', odometerKm: '', memo: '' })

export function FuelEntryView({ connection, onSaved }: Props) {
  // 앱이 닫혀도 쓰던 내용이 남도록 저장하지 않은 입력만 임시 보관한다(오프라인 A+).
  const [restored, setRestored] = useState(() => loadDraft('fuel') !== null)
  const [form, setForm] = useState<FuelForm>(() => loadDraft('fuel') ?? emptyForm())
  useEffect(() => saveDraft('fuel', form), [form])
  const [errors, setErrors] = useState<Partial<Record<keyof FuelForm, string>>>({})
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 영수증에서 읽어 채운 칸. 사용자가 그 칸을 고치면 표시를 지운다.
  const [fromReceipt, setFromReceipt] = useState<ReadonlySet<keyof FuelForm>>(new Set())
  const [scan, setScan] = useState<ReceiptScan>({ kind: 'idle' })

  const set = <K extends keyof FuelForm>(key: K, value: FuelForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setFromReceipt((s) => {
      if (!s.has(key)) return s
      const next = new Set(s)
      next.delete(key)
      return next
    })
  }

  const resetForm = () => {
    setForm(emptyForm())
    setFromReceipt(new Set())
    setScan({ kind: 'idle' })
  }

  const handleReceipt = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // 같은 사진을 다시 골라도 동작하게 한다
    if (!file || scan.kind === 'reading') return
    setError(null)
    if (isOffline()) return setScan({ kind: 'error', message: OFFLINE_MESSAGE })
    setScan({ kind: 'reading' })
    try {
      const image = await prepareReceiptImage(file)
      const ocr = await connection.backend.ocrReceipt(image)
      const receipt = parseFuelReceipt(ocr.text)
      const filled = fillFuelForm(form, receipt)
      // 글자를 읽는 동안 고친 누적 km·비고가 있으면 그 값을 살린다.
      setForm((current) => fillFuelForm(current, receipt).form)
      setFromReceipt(new Set(filled.filled))
      setErrors({})
      setScan({ kind: 'read', text: ocr.text, missing: filled.missing, tempFileLeft: ocr.tempFileLeft })
    } catch (e) {
      setScan({ kind: 'error', message: e instanceof Error ? e.message : '영수증을 읽지 못했습니다.' })
    }
  }


  const handleError = (e: unknown) => {
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
    if (isOffline()) return setError(OFFLINE_MESSAGE)
    setBusy(true)
    try {
      setStage({ kind: 'confirm', plan: await planFuelWrite(connection, result.input) })
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (plan: FuelWritePlan) => {
    if (busy) return
    setError(null)
    if (isOffline()) return setError(OFFLINE_MESSAGE)
    setBusy(true)
    try {
      const result = await commitFuelWrite(connection, plan)
      clearDraft('fuel')
      setRestored(false)
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
              resetForm()
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
          {restored && (
            <DraftNotice
              onDiscard={() => {
                resetForm()
                setRestored(false)
              }}
            />
          )}
          <ReceiptPicker scan={scan} onChange={(e) => void handleReceipt(e)} />
          <form className="form" onSubmit={handleReview} noValidate>
            <Field label="날짜" error={errors.date} fromReceipt={fromReceipt.has('date')}>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </Field>
            <div className="grid-2">
              <Field label="단가 (원/L)" error={errors.unitPrice} fromReceipt={fromReceipt.has('unitPrice')}>
                <input inputMode="decimal" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="1809" />
              </Field>
              <Field label="리터" error={errors.liters} fromReceipt={fromReceipt.has('liters')}>
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
              <Field label="결제 금액 (원)" error={errors.manualCost} fromReceipt={fromReceipt.has('manualCost')}>
                <input inputMode="decimal" value={form.manualCost} onChange={(e) => set('manualCost', e.target.value)} placeholder="50000" />
              </Field>
            )}
            <Field label="누적 km (선택)" error={errors.odometerKm}>
              <input inputMode="numeric" value={form.odometerKm} onChange={(e) => set('odometerKm', e.target.value)} />
            </Field>
            <Field label="비고 (선택)">
              <input type="text" value={form.memo} onChange={(e) => set('memo', e.target.value)} />
            </Field>
            <button type="submit" disabled={busy}>
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

function ReceiptPicker({ scan, onChange }: { scan: ReceiptScan; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const reading = scan.kind === 'reading'
  return (
    <div className="receipt">
      <div className="row">
        <label className={`button secondary${reading ? ' disabled' : ''}`}>
          영수증 사진 찍기
          <input type="file" accept="image/*" capture="environment" onChange={onChange} disabled={reading} hidden data-testid="receipt-camera" />
        </label>
        <label className={`button secondary${reading ? ' disabled' : ''}`}>
          사진 고르기
          <input type="file" accept="image/*" onChange={onChange} disabled={reading} hidden data-testid="receipt-gallery" />
        </label>
      </div>
      {reading && <p role="status">영수증 글자를 읽는 중…</p>}
      {scan.kind === 'error' && (
        <p role="alert" className="message error">
          {scan.message}
        </p>
      )}
      {scan.kind === 'read' && (
        <div role="status" className="message notice">
          <p>
            영수증에서 읽은 값을 채웠습니다. 인식이 틀릴 수 있으니 확인한 뒤 저장해 주세요.
            {scan.missing.length > 0 && ` 찾지 못함: ${scan.missing.map((f) => RECEIPT_FIELD_LABELS[f]).join(', ')}.`}
          </p>
          {scan.tempFileLeft && (
            <p className="field-error">Drive의 임시 문서 "Niro Manager 영수증 인식(임시)"를 지우지 못했습니다. Drive에서 직접 지워 주세요.</p>
          )}
          <details>
            <summary>인식한 글자 보기</summary>
            <pre className="receipt-text">{scan.text.trim() === '' ? '(읽은 글자 없음)' : scan.text}</pre>
          </details>
        </div>
      )}
    </div>
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
