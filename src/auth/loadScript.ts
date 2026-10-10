const pending = new Map<string, Promise<void>>()

/** 외부 스크립트를 한 번만 불러온다. */
export function loadScript(src: string): Promise<void> {
  const existing = pending.get(src)
  if (existing) return existing
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      pending.delete(src)
      reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`))
    }
    document.head.appendChild(script)
  })
  pending.set(src, promise)
  return promise
}
