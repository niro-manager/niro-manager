/** 축 눈금용 "보기 좋은" 간격과 눈금 목록을 만든다. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (min === max) {
    if (min === 0) return [0, 1]
    const pad = Math.abs(min) * 0.1
    return niceTicks(min - pad, max + pad, target)
  }
  const raw = (max - min) / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude)
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)))
  return ticks
}

/** 'yyyy-mm' → x축 라벨. 1월이거나 첫 칸이면 연도를 붙인다. */
export function monthLabel(month: string, isFirst: boolean): string {
  const [year, mm] = month.split('-')
  return isFirst || mm === '01' ? `${year?.slice(2)}.${mm}` : `${Number(mm)}월`
}
