import type { ReactNode } from 'react'

export function Field({ label, error, fromReceipt, children }: { label: string; error?: string; fromReceipt?: boolean; children: ReactNode }) {
  return (
    <label>
      <span>
        {label}
        {fromReceipt && <span className="badge badge-receipt">영수증에서 읽음</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <div className="message notice row spread">
      <span>저장하지 않았던 입력을 복원했습니다.</span>
      <button type="button" className="secondary small" onClick={onDiscard}>
        지우기
      </button>
    </div>
  )
}
