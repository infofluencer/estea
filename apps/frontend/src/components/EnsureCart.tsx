"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ensureCartAction } from "@/lib/actions"

export function EnsureCart() {
  const router = useRouter()
  const [, start] = useTransition()

  useEffect(() => {
    start(async () => {
      await ensureCartAction()
      router.refresh()
    })
  }, [router])

  return <p className="cart-main__loading">Sepet hazırlanıyor…</p>
}
