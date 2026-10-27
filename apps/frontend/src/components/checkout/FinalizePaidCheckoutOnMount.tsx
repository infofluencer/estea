"use client"

import { useEffect, useRef } from "react"
import { finalizePaidCheckoutSession } from "@/lib/checkout-actions"

/**
 * Clears cart + pending-checkout snapshot after a paid/stub success.
 * Must not run during RSC render — cookie writes only in Server Actions.
 */
export function FinalizePaidCheckoutOnMount() {
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void finalizePaidCheckoutSession()
  }, [])

  return null
}
