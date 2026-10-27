"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { restorePendingCheckoutCartAction } from "@/lib/checkout-actions"

type Props = {
  /** After a successful restore, navigate here (e.g. `/odeme`). */
  redirectOnRestore?: string
  /** Optional UI while restore runs (checkout empty gate). */
  children?: ReactNode
}

/**
 * Rebuilds cart from pending snapshot. Cookie writes happen only via the
 * Server Action — never during RSC render.
 */
export function RestorePendingCheckoutOnMount({
  redirectOnRestore,
  children,
}: Props) {
  const router = useRouter()
  const ran = useRef(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    void restorePendingCheckoutCartAction()
      .then((res) => {
        if (res.ok && res.restored && redirectOnRestore) {
          router.replace(redirectOnRestore)
          return
        }
        setDone(true)
        router.refresh()
      })
      .catch(() => {
        setDone(true)
      })
  }, [redirectOnRestore, router])

  if (children) {
    if (!done) {
      return (
        <p className="checkout-empty__text" style={{ margin: "1.5rem 0" }}>
          Sepet hazırlanıyor…
        </p>
      )
    }
    return <>{children}</>
  }

  return null
}
