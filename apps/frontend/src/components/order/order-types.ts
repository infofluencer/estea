export type OrderItemDetailQty = {
  fulfilled_quantity?: number | string | null
  shipped_quantity?: number | string | null
  delivered_quantity?: number | string | null
  return_requested_quantity?: number | string | null
  return_received_quantity?: number | string | null
  return_dismissed_quantity?: number | string | null
}

export type OrderDetailView = {
  id: string
  display_id?: number | string | null
  custom_display_id?: string | null
  status?: string | null
  email?: string | null
  currency_code?: string | null
  created_at?: string | Date | null
  total?: number | null
  item_total?: number | null
  item_subtotal?: number | null
  original_item_total?: number | null
  discount_total?: number | null
  shipping_total?: number | null
  payment_collections?:
    | {
        id?: string
        status?: string | null
      }[]
    | null
  /** Havale siparişi ödeme bekliyorsa banka bilgileri (backend ekler), aksi halde null. */
  bank_transfer?: {
    bank_name: string
    account_name: string
    iban: string
  } | null
  items?:
    | {
        id?: string
        title?: string | null
        quantity?: number | null
        unit_price?: number | null
        variant_sku?: string | null
        detail?: OrderItemDetailQty | null
        thumbnail?: string | null
        variant?: {
          title?: string | null
          sku?: string | null
          product?: { handle?: string | null } | null
        } | null
      }[]
    | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    address_1?: string | null
    city?: string | null
    postal_code?: string | null
    country_code?: string | null
    phone?: string | null
    metadata?: { district?: string | null } | null
  } | null
  shipping_methods?:
    | { name?: string | null; amount?: number | null }[]
    | null
  fulfillments?:
    | {
        id?: string
        shipped_at?: string | Date | null
        delivered_at?: string | Date | null
        labels?:
          | {
              tracking_number?: string | null
              tracking_url?: string | null
              label_url?: string | null
            }[]
          | null
        /** Normalize kargo verisi (backend src/modules/carrier/types.ts). */
        data?: {
          carrier?: string | null
          carrier_name?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
        } | null
      }[]
    | null
  returns?:
    | {
        id?: string
        status?: string | null
        created_at?: string | Date | null
        metadata?: {
          rejected?: boolean
          /** Admin'in müşteriye ilettiği iade kodu */
          return_code?: string | null
          return_code_sent_at?: string | null
          escay_rejection?: {
            rejected?: boolean
            reason?: string | null
            at?: string | null
          } | null
          paytr_refund?: {
            status?: string | null
            amount?: number | null
            at?: string | null
            error?: string | null
          } | null
        } | null
        items?: { item_id?: string | null }[] | null
      }[]
    | null
}

/** Reddedilmiş iadedeki kalemler — siteden tekrar talep açılmaz (backend ile aynı kural). */
export function rejectedReturnItemIds(returns: OrderDetailView["returns"]): Set<string> {
  const ids = new Set<string>()
  for (const r of returns || []) {
    const rejected = r.metadata?.escay_rejection?.rejected === true || r.metadata?.rejected === true
    if (!rejected) continue
    for (const it of r.items || []) if (it.item_id) ids.add(it.item_id)
  }
  return ids
}

export type ReturnReason = {
  id: string
  value?: string | null
  label?: string | null
}

export type ReturnRequestResult = {
  id: string
  status?: string | null
  order_id: string
  created_at?: string | Date | null
}

export type OrderReturnContext =
  | { mode: "customer" }
  | { mode: "guest"; email: string }

function asNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value) || 0
  return Number(value) || 0
}

/** Teslim edilmiş − mevcut iade talepleri = iade edilebilir azami adet */
export function getReturnableQuantity(
  detail: OrderItemDetailQty | null | undefined
): number {
  if (!detail) return 0
  // Yalnız teslim edilmiş adet (backend returnableQuantity ile aynı).
  const delivered = asNumber(detail.delivered_quantity)
  const already =
    asNumber(detail.return_requested_quantity) +
    asNumber(detail.return_received_quantity) +
    asNumber(detail.return_dismissed_quantity)
  return Math.max(0, delivered - already)
}
