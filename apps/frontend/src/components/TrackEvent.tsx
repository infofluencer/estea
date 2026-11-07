"use client"

import { useEffect } from "react"
import { onConsentChange } from "@/lib/consent"
import {
  type AnalyticsItem,
  trackBeginCheckout,
  trackPurchase,
  trackViewItem,
} from "@/lib/analytics"

/** Server component sayfalarından analytics event'i tetiklemek için. */
export function TrackViewItem({ item }: { item: AnalyticsItem | null }) {
  useEffect(() => {
    if (item) trackViewItem(item)
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export function TrackBeginCheckout({
  items,
  total,
}: {
  items: AnalyticsItem[]
  total?: number
}) {
  useEffect(() => {
    trackBeginCheckout(items, total)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export function TrackPurchase({
  order,
}: {
  order: { id: string; total: number; items: AnalyticsItem[] } | null
}) {
  useEffect(() => {
    if (!order) return
    // Analytics layout'ta sayfadan sonra render edildiği için effect'i bundan sonra
    // çalışır (tam sayfa yüklemesinde gtag henüz yok) → bir tick bekle; onay sonradan
    // verilirse de o an gönder.
    const attempt = () => setTimeout(() => trackPurchase(order), 0)
    const timer = attempt()
    const off = onConsentChange(() => attempt())
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [order?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
