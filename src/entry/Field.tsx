import type { ReactNode } from 'react'

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label>
      {label}
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
