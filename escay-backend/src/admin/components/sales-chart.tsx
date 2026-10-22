import { Text } from "@medusajs/ui"
import { useEffect, useMemo, useRef, useState } from "react"

export type ChartBucket = "hour" | "day" | "week" | "month"
export type ChartPoint = { date: string; orders: number; revenue: number }

type Props = {
  series: ChartPoint[]
  previous: ChartPoint[]
  bucket: ChartBucket
  metric: "revenue" | "orders"
}

const HEIGHT = 260
const M = { top: 20, right: 16, bottom: 28, left: 64 }

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })
const compactMoney = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  notation: "compact",
  maximumFractionDigits: 1,
})
const num = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 })

export function formatBucket(key: string, bucket: ChartBucket, long = false): string {
  if (bucket === "hour") {
    const [day, hour] = key.split("T")
    const h = `${hour}:00`
    if (!long) return h
    const d = new Date(`${day}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", timeZone: "UTC" })
    return `${d} ${h}–${String(Number(hour) + 1).padStart(2, "0")}:00`
  }
  const d = new Date(`${key}T00:00:00Z`)
  if (bucket === "month") return d.toLocaleDateString("tr-TR", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" })
  const label = d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    ...(long && bucket === "day" ? { weekday: "short" } : {}),
    timeZone: "UTC",
  })
  return bucket === "week" && long ? `${label} haftası` : label
}

/** 0'dan başlayan, "yuvarlak" 4-5 eksen çizgisi. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const rough = max / 4
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) || 10 * pow
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

/**
 * Satış grafiği — seçilen dönem (dolu çizgi + alan) ve önceki eşit dönem
 * (kesikli çizgi), aynı eksende. Üzerine gelince dikey çizgi + ayrıntı kutusu.
 * Renkler Medusa tema değişkenleri → açık/koyu temada otomatik.
 */
export const SalesChart = ({ series, previous, bucket, metric }: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const value = (p?: ChartPoint) => (p ? p[metric] : 0)
  const fmt = (v: number) => (metric === "revenue" ? money.format(v) : `${num.format(v)} sipariş`)
  const fmtAxis = (v: number) => (metric === "revenue" ? compactMoney.format(v) : num.format(v))

  const geo = useMemo(() => {
    const n = series.length
    const max = Math.max(0, ...series.map(value), ...previous.slice(0, n).map(value))
    const ticks = niceTicks(metric === "orders" ? Math.max(max, 4) : max)
    const top = ticks[ticks.length - 1]
    const innerW = width - M.left - M.right
    const innerH = HEIGHT - M.top - M.bottom
    const x = (i: number) => M.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const y = (v: number) => M.top + innerH - (v / top) * innerH
    const line = (pts: ChartPoint[]) =>
      pts.slice(0, n).map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(value(p)).toFixed(1)}`).join("")
    const cur = line(series)
    const area = n ? `${cur}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : ""
    // En yüksek nokta — tek doğrudan etiket
    let peak = -1
    series.forEach((p, i) => {
      if (value(p) > 0 && (peak < 0 || value(p) > value(series[peak]))) peak = i
    })
    // X ekseni: genişliğe göre ~6-8 etiket
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 90))))
    const xLabels = series.map((_, i) => i).filter((i) => i % every === 0)
    return { n, ticks, x, y, cur, area, prev: line(previous), peak, xLabels, innerW }
  }, [series, previous, metric, width])

  const hasCurrent = series.some((p) => p.orders > 0)
  const hasPrevious = previous.some((p) => p.orders > 0)

  if (!hasCurrent && !hasPrevious) {
    return <Text size="small" className="px-6 py-8 text-ui-fg-subtle">Bu aralıkta satış yok.</Text>
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / rect.width
    setHover(Math.min(geo.n - 1, Math.max(0, Math.round(rel * (geo.n - 1)))))
  }

  const h = hover !== null ? series[hover] : null
  const hp = hover !== null ? previous[hover] : null
  const tipLeft = hover !== null ? Math.min(Math.max(geo.x(hover), M.left + 90), width - M.right - 90) : 0

  return (
    <div className="px-6 pb-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="flex items-center gap-2 txt-compact-small text-ui-fg-subtle">
          <svg width="20" height="8" aria-hidden><line x1="0" y1="4" x2="20" y2="4" stroke="var(--fg-interactive)" strokeWidth="2" /></svg>
          Seçilen dönem
        </span>
        {hasPrevious ? (
          <span className="flex items-center gap-2 txt-compact-small text-ui-fg-subtle">
            <svg width="20" height="8" aria-hidden><line x1="0" y1="4" x2="20" y2="4" stroke="var(--fg-muted)" strokeWidth="2" strokeDasharray="4 3" /></svg>
            Önceki dönem
          </span>
        ) : (
          <span className="txt-compact-small text-ui-fg-muted">Önceki dönemde satış yok</span>
        )}
      </div>
      <div ref={wrapRef} className="relative w-full">
        <svg width={width} height={HEIGHT} role="img" aria-label="Satış grafiği" className="block">
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--border-base)" strokeWidth="1" />
              <text x={M.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--fg-muted)">
                {fmtAxis(t)}
              </text>
            </g>
          ))}
          {geo.xLabels.map((i) => (
            <text key={i} x={geo.x(i)} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">
              {formatBucket(series[i].date, bucket)}
            </text>
          ))}
          {hasPrevious ? (
            <path d={geo.prev} fill="none" stroke="var(--fg-muted)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
          ) : null}
          <path d={geo.area} fill="var(--fg-interactive)" fillOpacity="0.12" />
          <path d={geo.cur} fill="none" stroke="var(--fg-interactive)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {geo.peak >= 0 && hover === null ? (
            <g>
              <circle cx={geo.x(geo.peak)} cy={geo.y(value(series[geo.peak]))} r="4" fill="var(--fg-interactive)" stroke="var(--bg-base)" strokeWidth="2" />
              <text
                x={Math.min(Math.max(geo.x(geo.peak), M.left + 40), width - M.right - 40)}
                y={geo.y(value(series[geo.peak])) - 10}
                textAnchor="middle"
                fontSize="11"
                fontWeight="500"
                fill="var(--fg-base)"
              >
                {fmtAxis(value(series[geo.peak]))}
              </text>
            </g>
          ) : null}
          {hover !== null ? (
            <g>
              <line x1={geo.x(hover)} x2={geo.x(hover)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--border-strong)" strokeWidth="1" />
              {hp && hasPrevious ? (
                <circle cx={geo.x(hover)} cy={geo.y(value(hp))} r="4" fill="var(--fg-muted)" stroke="var(--bg-base)" strokeWidth="2" />
              ) : null}
              <circle cx={geo.x(hover)} cy={geo.y(value(h!))} r="5" fill="var(--fg-interactive)" stroke="var(--bg-base)" strokeWidth="2" />
            </g>
          ) : null}
          <rect
            x={M.left}
            y={M.top}
            width={geo.innerW}
            height={HEIGHT - M.top - M.bottom}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {h ? (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[180px] -translate-x-1/2 rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 shadow-elevation-tooltip"
            style={{ left: tipLeft }}
          >
            <div className="txt-compact-small-plus">{formatBucket(h.date, bucket, true)}</div>
            <div className="txt-compact-small mt-1">
              {money.format(h.revenue)} · {num.format(h.orders)} sipariş
            </div>
            {hp && hasPrevious ? (
              <div className="txt-compact-small text-ui-fg-subtle">
                Önceki: {formatBucket(hp.date, bucket, true)} — {fmt(value(hp))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
