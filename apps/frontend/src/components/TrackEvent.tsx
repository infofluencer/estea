"use client"

import { useEffect } from "react"
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
    if (order) trackPurchase(order)
  }, [order?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
