import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { monthLabel, niceTicks } from './scale'

export interface ChartPoint {
  month: string
  value: number | null
  /** 툴팁에 덧붙일 설명(예: 금액 미입력 건수) */
  note?: string
}

interface Props {
  title: string
  kind: 'bar' | 'line'
  points: ChartPoint[]
  format: (value: number) => string
  /** 축 눈금용 짧은 형식 */
  formatTick: (value: number) => string
}

const HEIGHT = 200
const MARGIN = { top: 12, right: 12, bottom: 26, left: 52 }
const MAX_BAR = 24
const RADIUS = 4

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** 위쪽만 둥근 막대 경로(기준선 쪽은 각짐) */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export function MonthlyChart({ title, kind, points, format, formatTick }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const values = points.map((p) => p.value).filter((v): v is number => v !== null)
  const lastIndex = points.reduce((acc, p, i) => (p.value !== null ? i : acc), -1)
  const lastValue = lastIndex >= 0 ? points[lastIndex]?.value ?? null : null

  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const ticks = values.length === 0 ? [0, 1] : kind === 'bar' ? niceTicks(0, Math.max(...values)) : niceTicks(Math.min(...values), Math.max(...values))
  const yMin = ticks[0] ?? 0
  const yMax = ticks[ticks.length - 1] ?? 1
  const y = (v: number) => MARGIN.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH
  const band = points.length > 0 ? plotW / points.length : 0
  const cx = (i: number) => MARGIN.left + band * (i + 0.5)
  const barW = Math.max(2, Math.min(MAX_BAR, band - 2))
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 44))))

  const pick = (clientX: number, target: SVGSVGElement) => {
    const box = target.getBoundingClientRect()
    const i = Math.floor((clientX - box.left - MARGIN.left) / (band || 1))
    setActive(i >= 0 && i < points.length ? i : null)
  }
  const onPointer = (e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.currentTarget)
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const start = active ?? lastIndex
    setActive(Math.min(points.length - 1, Math.max(0, start + (e.key === 'ArrowRight' ? 1 : -1))))
  }

  // 값이 없는 달에서 끊기는 선분들
  const segments: string[] = []
  if (kind === 'line') {
    let current = ''
    points.forEach((p, i) => {
      if (p.value === null) {
        if (current) segments.push(current)
        current = ''
      } else {
        current += `${current ? 'L' : 'M'}${cx(i)},${y(p.value)}`
      }
    })
    if (current) segments.push(current)
  }

  const activePoint = active !== null ? points[active] : undefined
  // 툴팁은 가리키는 달을 가리지 않도록 크로스헤어 옆에 둔다
  const tooltipOnLeft = active !== null && cx(active) > width / 2

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="chart-title">{title}</span>
        {lastValue !== null && lastIndex >= 0 && (
          <span className="chart-latest">
            {monthLabel(points[lastIndex]!.month, true)} <strong>{format(lastValue)}</strong>
          </span>
        )}
      </figcaption>
      <div ref={ref} className="chart-body">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${title} 월별 ${kind === 'bar' ? '막대' : '선'} 차트. 화살표 키로 달을 옮겨 값을 볼 수 있습니다.`}
            tabIndex={0}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} />
                <text className="tick" x={MARGIN.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                  {formatTick(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % labelEvery === 0 ? (
                <text key={p.month} className="tick" x={cx(i)} y={HEIGHT - 8} textAnchor="middle">
                  {monthLabel(p.month, i === 0)}
                </text>
              ) : null,
            )}
            {kind === 'bar' &&
              points.map((p, i) =>
                p.value !== null && p.value > 0 ? (
                  <path key={p.month} className={i === active ? 'bar active' : 'bar'} d={barPath(cx(i) - barW / 2, y(p.value), barW, y(yMin) - y(p.value))} />
                ) : null,
              )}
            {kind === 'line' && (
              <>
                {active !== null && <line className="crosshair" x1={cx(active)} x2={cx(active)} y1={MARGIN.top} y2={MARGIN.top + plotH} />}
                {segments.map((d) => (
                  <path key={d} className="line" d={d} />
                ))}
                {points.map((p, i) =>
                  p.value !== null && (i === active || i === lastIndex) ? <circle key={p.month} className="dot" cx={cx(i)} cy={y(p.value)} r={4} /> : null,
                )}
              </>
            )}
          </svg>
        )}
        {activePoint && (
          <div className="tooltip" style={tooltipOnLeft ? { right: width - cx(active!) + 8 } : { left: cx(active!) + 8 }} role="status">
            <strong>{activePoint.value === null ? '기록 없음' : format(activePoint.value)}</strong>
            <span>{activePoint.month.replace('-', '년 ')}월</span>
            {activePoint.note && <span className="tooltip-note">{activePoint.note}</span>}
          </div>
        )}
      </div>
    </figure>
  )
}
