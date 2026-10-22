"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { onConsentChange, readConsent } from "@/lib/consent"

const BRAND_ID = process.env.NEXT_PUBLIC_OMNISEND_BRAND_ID?.trim() || ""
const LAUNCHER_SRC = "https://omnisnippet1.com/inshop/launcher-v2.js"

type OmnisendQueue = unknown[][] & { push: (args: unknown[]) => void }

declare global {
  interface Window {
    omnisend?: OmnisendQueue
  }
}

function load() {
  if (!BRAND_ID || document.getElementById("omnisend-launcher")) return
  window.omnisend = window.omnisend || ([] as unknown as OmnisendQueue)
  window.omnisend.push(["brandID", BRAND_ID])
  window.omnisend.push(["track", "$pageViewed"])
  const script = document.createElement("script")
  script.id = "omnisend-launcher"
  script.async = true
  script.src = LAUNCHER_SRC
  document.head.appendChild(script)
}

/**
 * Omnisend web takibi + pop-up formlar. Yalnızca CookieYes'te
 * "Reklam" (advertisement) onayı varsa yüklenir (KVKK). Sipariş/checkout event'leri
 * backend'den REST API ile gider (lib/omnisend.ts) — buna bağlı değil.
 */
export function OmnisendSnippet() {
  const pathname = usePathname()

  useEffect(() => {
    if (!BRAND_ID) return
    if (readConsent()?.marketing) load()
    return onConsentChange((consent) => {
      if (consent?.marketing) load()
    })
  }, [])

  // Client-side navigasyonlarda sayfa görüntüleme (ilk yükleme load() içinde)
  const firstPath = useRef(true)
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false
      return
    }
    if (document.getElementById("omnisend-launcher")) {
      window.omnisend?.push(["track", "$pageViewed"])
    }
  }, [pathname])

  return null
}
