/**
 * GA4 + Google Ads (gtag) ve Meta Pixel e-ticaret event'leri.
 * Script'ler components/Analytics.tsx'te çerez onayıyla yüklenir; yüklü değilse
 * bu fonksiyonlar sessizce no-op olur.
 *
 * Ürün ID'si: Medusa varyant id — ürün feed'indeki g:id ile aynı olmalı ki Meta
 * dinamik reklamları / Merchant Center eşleşsin (lib/product-feed.ts).
 */

export type AnalyticsItem = {
  id: string
  name: string
  variant?: string
  price: number
  quantity: number
}

type LineItemLike = {
  variant_id?: string | null
  product_title?: string | null
  product_handle?: string | null
  variant_title?: string | null
  title?: string | null
  unit_price?: number | string | null
  quantity?: number | string | null
  variant?: { id?: string; metadata?: Record<string, unknown> | null } | null
  product?: { handle?: string | null } | null
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }
}

export function analyticsItemFromLine(line: LineItemLike): AnalyticsItem {
  return {
    id: String(line.variant_id ?? line.variant?.id ?? ""),
    name: String(line.product_title || line.title || ""),
    variant: line.variant_title || undefined,
    price: Number(line.unit_price ?? 0),
    quantity: Number(line.quantity ?? 1),
  }
}

/** Sepete eklemeden dönen sepetten eklenen satırı bulur (varyant ya da ürün handle'ı). */
export function analyticsItemFromCart(
  cart: { items?: LineItemLike[] | null } | null | undefined,
  match: { variantId?: string | null; handle?: string | null }
): AnalyticsItem | null {
  const items = cart?.items ?? []
  const line =
    (match.variantId && items.find((i) => i.variant_id === match.variantId)) ||
    (match.handle &&
      items.find((i) => (i.product_handle || i.product?.handle) === match.handle)) ||
    null
  if (!line) return null
  return { ...analyticsItemFromLine(line), quantity: 1 }
}

function value(items: AnalyticsItem[]) {
  return Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100
}

function gaItems(items: AnalyticsItem[]) {
  return items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    item_variant: i.variant,
    price: i.price,
    quantity: i.quantity,
  }))
}

function send(
  gaEvent: string,
  pixelEvent: string,
  items: AnalyticsItem[],
  extra: { transactionId?: string; eventId?: string; value?: number } = {}
) {
  if (typeof window === "undefined" || !items.length) return
  const total = extra.value ?? value(items)
  window.gtag?.("event", gaEvent, {
    currency: "TRY",
    value: total,
    items: gaItems(items),
    ...(extra.transactionId ? { transaction_id: extra.transactionId } : {}),
  })
  window.fbq?.(
    "track",
    pixelEvent,
    {
      content_ids: items.map((i) => i.id),
      content_type: "product",
      contents: items.map((i) => ({ id: i.id, quantity: i.quantity })),
      value: total,
      currency: "TRY",
      num_items: items.reduce((s, i) => s + i.quantity, 0),
    },
    // Sunucu tarafı (Conversions API) ile aynı eventID → Meta tekilleştirir
    extra.eventId ? { eventID: extra.eventId } : undefined
  )
}

export const trackViewItem = (item: AnalyticsItem) =>
  send("view_item", "ViewContent", [item])

export const trackAddToCart = (item: AnalyticsItem) =>
  send("add_to_cart", "AddToCart", [item])

export const trackBeginCheckout = (items: AnalyticsItem[], total?: number) =>
  send("begin_checkout", "InitiateCheckout", items, { value: total })

// TODO(K7): Es Çay Google Ads hesabı — dönüşüm etiketi (AW-xxx/yyy'nin yyy kısmı).
const GOOGLE_ADS_ID = (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "").trim()
const GOOGLE_ADS_CONVERSION_LABEL = (
  process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL || ""
).trim()
/** Google Ads → Satın alma dönüşümü; ID veya etiket yoksa gönderilmez. */
const GOOGLE_ADS_PURCHASE_SEND_TO =
  GOOGLE_ADS_ID && GOOGLE_ADS_CONVERSION_LABEL
    ? `${GOOGLE_ADS_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`
    : null

export function trackPurchase(order: {
  id: string
  total: number
  items: AnalyticsItem[]
}) {
  // Sayfa yenilemesinde ikinci kez gönderme
  const key = `escay-purchase-tracked:${order.id}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, "1")
  } catch {
    /* ignore */
  }
  send("purchase", "Purchase", order.items, {
    transactionId: order.id,
    eventId: `purchase-${order.id}`,
    value: order.total,
  })
  if (typeof window === "undefined" || !GOOGLE_ADS_PURCHASE_SEND_TO) return
  window.gtag?.("event", "conversion", {
    send_to: GOOGLE_ADS_PURCHASE_SEND_TO,
    value: order.total,
    currency: "TRY",
    transaction_id: order.id,
  })
}
