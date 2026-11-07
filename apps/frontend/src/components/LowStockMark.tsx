import { useId } from "react"
import type { LowStockLabel } from "@/lib/stock"

const GLASS =
  "M3 1.5h10c0 4-2.5 6.5-2.5 9.5s2.2 5 1.7 9H3.8c-.5-4 1.7-6 1.7-9S3 5.5 3 1.5Z"

/** İnce belli bardak; içindeki çay seviyesi kalan stoğu gösterir. */
export function TeaGlassGauge({ critical }: { critical?: boolean }) {
  const clipId = useId()
  const level = critical ? 4 : 8
  return (
    <svg
      className="tea-gauge"
      width="14"
      height="19"
      viewBox="0 0 16 21.5"
      aria-hidden
    >
      <clipPath id={clipId}>
        <path d={GLASS} />
      </clipPath>
      <rect
        className="tea-gauge__tea"
        x="0"
        y={20 - level}
        width="16"
        height={level}
        clipPath={`url(#${clipId})`}
      />
      <path className="tea-gauge__glass" d={GLASS} />
    </svg>
  )
}

export function LowStockMark({
  label,
  className,
}: {
  label: LowStockLabel
  className?: string
}) {
  const critical = label.kind === "critical"
  return (
    <span
      className={`low-stock-mark${critical ? " is-critical" : ""}${
        className ? ` ${className}` : ""
      }`}
      aria-hidden
    >
      <TeaGlassGauge critical={critical} />
      <span>{label.text}</span>
    </span>
  )
}
