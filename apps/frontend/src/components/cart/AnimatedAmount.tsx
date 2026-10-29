"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Tutar değişince yeni değer kısa bir hareketle yerine oturur; ilk yüklemede
 * hareket yok (sayfa açılışında koreografi istemiyoruz).
 */
export function AnimatedAmount({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const first = useRef(true)
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setChanged(true)
  }, [value])

  return (
    <span
      key={value}
      className={`${className ?? ""}${changed ? " is-updated" : ""}`}
    >
      {value}
    </span>
  )
}
