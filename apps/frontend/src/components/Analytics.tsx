"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { onConsentChange, readConsent, type Consent } from "@/lib/consent"
import { isProductionHostname } from "@/lib/site"

// TODO(K7): Es Çay adına açılan hesapların ID'leri (Dokploy: Environment + Build-time Arguments).
// Boş bırakılan servis yüklenmez.
const GA4_ID = (process.env.NEXT_PUBLIC_GA4_ID || "").trim()
const GOOGLE_ADS_ID = (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "").trim()
const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim()
const CLARITY_ID = (process.env.NEXT_PUBLIC_CLARITY_ID || "").trim()

/** Staging / IP / localhost verisi canlı GA / Pixel'e karışmasın. */
function isProductionHost() {
  return isProductionHostname(window.location.hostname)
}

function addScript(id: string, src: string) {
  if (document.getElementById(id)) return
  const s = document.createElement("script")
  s.id = id
  s.async = true
  s.src = src
  document.head.appendChild(s)
}

function ensureGtag() {
  if (window.gtag) return
  if (!GA4_ID && !GOOGLE_ADS_ID) return
  const w = window as unknown as { dataLayer: unknown[] }
  w.dataLayer = w.dataLayer || []
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments)
  }
  window.gtag("js", new Date())
  addScript("gtag-js", `https://www.googletagmanager.com/gtag/js?id=${GA4_ID || GOOGLE_ADS_ID}`)
}

/** URL'deki kimlik bilgisi sayılan parametreler (misafir sipariş e-postası, reset/verify token). */
const SENSITIVE_PARAMS = ["email", "token", "code"]
/** Bu sayfalarda Meta Pixel PageView gönderilmez (URL'de e-posta/token taşınıyor). */
const SENSITIVE_PATHS = ["/reset-password", "/verify-email", "/order-tracking"]

/** Analytics'e giden URL: hassas parametre değerleri maskelenir (utm/gclid korunur). */
function safeLocation(): string {
  try {
    const url = new URL(window.location.href)
    for (const key of SENSITIVE_PARAMS) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "redacted")
    }
    return url.toString()
  } catch {
    return window.location.origin + window.location.pathname
  }
}

function isSensitivePath(): boolean {
  return SENSITIVE_PATHS.some((p) => window.location.pathname.startsWith(p))
}

function loadAnalytics() {
  if (GA4_ID) {
    ensureGtag()
    window.gtag?.("config", GA4_ID, { page_location: safeLocation() })
  }
  if (CLARITY_ID && !document.getElementById("clarity-js")) {
    const w = window as unknown as { clarity?: { q?: unknown[] } & ((...a: unknown[]) => void) }
    w.clarity =
      w.clarity ||
      Object.assign(
        function clarity(...args: unknown[]) {
          ;(w.clarity!.q = w.clarity!.q || []).push(args)
        },
        { q: [] as unknown[] }
      )
    addScript("clarity-js", `https://www.clarity.ms/tag/${CLARITY_ID}`)
  }
}

function loadMarketing() {
  if (GOOGLE_ADS_ID) {
    ensureGtag()
    window.gtag?.("config", GOOGLE_ADS_ID, { page_location: safeLocation() })
  }
  if (META_PIXEL_ID && !window.fbq) {
    type Fbq = ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void
      queue: unknown[]
      push: Fbq
      loaded: boolean
      version: string
    }
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args)
      else fbq.queue.push(args)
    } as Fbq
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = "2.0"
    fbq.queue = []
    window.fbq = fbq
    addScript("fb-pixel", "https://connect.facebook.net/en_US/fbevents.js")
    window.fbq("init", META_PIXEL_ID)
    if (!isSensitivePath()) window.fbq("track", "PageView")
  }
}

function apply(consent: Consent | null) {
  if (!consent || !isProductionHost()) return
  if (consent.analytics) loadAnalytics()
  if (consent.marketing) loadMarketing()
}

/**
 * GA4, Google Ads, Meta Pixel, Clarity — CookieYes onayına göre
 * (analytics: GA4 + Clarity, advertisement: Ads + Pixel). Yalnızca canlı domain'de.
 */
export function Analytics() {
  const pathname = usePathname()

  useEffect(() => {
    apply(readConsent())
    return onConsentChange(apply)
  }, [])

  // Client-side navigasyonda sayfa görüntüleme (ilk yükleme config/init ile gider)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    window.gtag?.("event", "page_view", {
      page_location: safeLocation(),
      page_path: pathname,
    })
    if (!isSensitivePath()) window.fbq?.("track", "PageView")
  }, [pathname])

  return null
}
