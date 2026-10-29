/**
 * Ürün değişimi (aynı ürün, başka gramaj/çeşit) — saf kurallar (Medusa / DB yok).
 *
 * Medusa siparişi: değişim = Es Çay iadesi + `return.metadata.escay_exchange`.
 * Para iadesi yapılmaz; iade gelip kabul edilince yeni ürünün gönderisi açılır.
 */

export type ExchangeItem = {
  /** İade edilen sipariş kalemi */
  item_id: string
  quantity: number
  /** Gönderilecek yeni varyant */
  variant_id: string
  title: string
  /** Eski varyant (ör. "Siyah / M") */
  from_variant: string | null
  /** Yeni varyant (ör. "Siyah / L") */
  to_variant: string | null
  to_sku: string | null
}

export type ExchangeStatus =
  /** İade bekleniyor (ya da teslim alındı, gönderi henüz açılmadı) */
  | "requested"
  /** Yeni ürün gönderisi açıldı (etiket hazır) */
  | "shipment_created"
  /** Gönderi açılamadı — admin tekrar dener */
  | "failed"
  | "canceled"

export type ExchangeMeta = {
  status: ExchangeStatus
  items: ExchangeItem[]
  source: "customer" | "guest" | "admin"
  requested_at: string
  by: string | null
  /** Var olan iade sonradan değişime çevrildi */
  converted_at?: string
  /** Siparişe eklenen yeni kalemler (order edit, birim fiyat 0) */
  new_item_ids?: string[]
  fulfillment_id?: string
  shipment_at?: string
  label_printed_at?: string
  error?: string
  error_at?: string
  canceled_at?: string
  canceled_by?: string | null
}

export const EXCHANGE_META_KEY = "escay_exchange"

export function readExchange(metadata: Record<string, unknown> | null | undefined): ExchangeMeta | null {
  const raw = metadata?.[EXCHANGE_META_KEY]
  if (!raw || typeof raw !== "object") return null
  const ex = raw as ExchangeMeta
  return Array.isArray(ex.items) && typeof ex.status === "string" ? ex : null
}

/** İptal edilmemiş değişim: para iadesi yapılmaz. */
export function isExchangeActive(metadata: Record<string, unknown> | null | undefined): boolean {
  const ex = readExchange(metadata)
  return Boolean(ex && ex.status !== "canceled")
}

function qty(value: unknown): number {
  if (value && typeof value === "object" && "value" in (value as object)) {
    return qty((value as { value: unknown }).value)
  }
  const n = Math.floor(Number(value ?? 0))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Teslim alınan iadeye göre gönderilecek yeni ürünler: her kalem için
 * min(değişim adedi, kabul edilen adet). Kabul edilmeyen (eksik / reddedilen)
 * adet için yeni ürün gönderilmez.
 */
export function planExchangeShipment(
  exchange: Pick<ExchangeMeta, "items">,
  returnItems: { item_id?: string | null; quantity?: unknown; received_quantity?: unknown }[],
  returnStatus?: string | null
): { item_id: string; variant_id: string; quantity: number }[] {
  const received = new Map<string, number>()
  for (const ri of returnItems) {
    if (!ri.item_id) continue
    // Tam kabulde (received) Medusa received_quantity'yi boş bırakabilir.
    const n = qty(ri.received_quantity) || (returnStatus === "received" ? qty(ri.quantity) : 0)
    received.set(ri.item_id, (received.get(ri.item_id) || 0) + n)
  }
  const out: { item_id: string; variant_id: string; quantity: number }[] = []
  for (const it of exchange.items) {
    const left = received.get(it.item_id) || 0
    const n = Math.min(qty(it.quantity), left)
    if (n <= 0) continue
    received.set(it.item_id, left - n)
    out.push({ item_id: it.item_id, variant_id: it.variant_id, quantity: n })
  }
  return out
}

export type VariantChoice = {
  variant_id: string
  title: string
  sku: string | null
  /** null = stok takibi yok / ön siparişe açık */
  available: number | null
}

type VariantLike = {
  id: string
  title?: string | null
  sku?: string | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  options?: { value?: string | null; option?: { title?: string | null } | null }[] | null
  inventory_items?:
    | {
        required_quantity?: unknown
        inventory?: {
          location_levels?: { location_id?: string | null; available_quantity?: unknown }[] | null
        } | null
      }[]
    | null
}

/** "Gramaj: 500 g · Paket: Kutu" yerine kısa "500 g / Kutu"; seçenek yoksa varyant adı. */
export function variantLabel(v: Pick<VariantLike, "title" | "options">): string {
  const values = (v.options || []).map((o) => String(o.value || "").trim()).filter(Boolean)
  if (values.length) return values.join(" / ")
  const title = String(v.title || "").trim()
  return /^default/i.test(title) ? "" : title
}

/** Satılabilir adet (varsayılan depoda); stok takibi yoksa null. */
export function variantAvailable(v: VariantLike, locationId?: string | null): number | null {
  if (v.manage_inventory === false || v.allow_backorder === true) return null
  const items = v.inventory_items || []
  if (!items.length) return null
  let min = Infinity
  for (const ii of items) {
    const levels = ii.inventory?.location_levels || []
    const level = (locationId && levels.find((l) => l.location_id === locationId)) || levels[0]
    const available = Number(
      level?.available_quantity && typeof level.available_quantity === "object"
        ? (level.available_quantity as { value?: unknown }).value
        : level?.available_quantity ?? 0
    )
    const required = Math.max(1, qty(ii.required_quantity) || 1)
    min = Math.min(min, Math.floor((Number.isFinite(available) ? available : 0) / required))
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0
}

/** Aynı ürünün diğer varyantları (mevcut varyant hariç), stok bilgisiyle. */
export function exchangeChoices(
  variants: VariantLike[],
  currentVariantId: string | null | undefined,
  locationId?: string | null
): VariantChoice[] {
  return variants
    .filter((v) => v.id && v.id !== currentVariantId)
    .map((v) => ({
      variant_id: v.id,
      title: variantLabel(v) || v.sku || v.id,
      sku: v.sku || null,
      available: variantAvailable(v, locationId),
    }))
}

/**
 * Seçimleri doğrular: varyant aynı ürünün başka varyantı olmalı, stok yetmeli
 * (aynı varyant birden çok satırda seçilirse toplam adet). Hata metni panelde /
 * mağazada gösterilir.
 */
export function validateExchangeChoices(
  selections: { key: string; quantity: number; variant_id: string }[],
  choicesByKey: Map<string, VariantChoice[]>
): void {
  const needed = new Map<string, { n: number; choice: VariantChoice }>()
  for (const s of selections) {
    const choice = (choicesByKey.get(s.key) || []).find((c) => c.variant_id === s.variant_id)
    if (!choice) throw new Error("Seçilen gramaj/çeşit bu ürün için geçerli değil.")
    const prev = needed.get(s.variant_id)
    needed.set(s.variant_id, { n: (prev?.n || 0) + s.quantity, choice })
  }
  for (const { n, choice } of needed.values()) {
    if (choice.available !== null && choice.available < n) {
      throw new Error(
        choice.available > 0
          ? `${choice.title} için stokta yalnız ${choice.available} adet var.`
          : `${choice.title} stokta yok.`
      )
    }
  }
}

/** Liste / rozet durumu (iade + gönderi durumundan türetilir). */
export type ExchangeDisplayState =
  | "awaiting_return"
  | "to_ship"
  | "failed"
  | "label_ready"
  | "shipped"
  | "delivered"
  | "rejected"
  | "canceled"

export function exchangeDisplayState(input: {
  exchange: Pick<ExchangeMeta, "status">
  returnReceived: boolean
  returnRejected?: boolean
  returnCanceled?: boolean
  shipment?: { shipped?: boolean; delivered?: boolean; canceled?: boolean } | null
}): ExchangeDisplayState {
  if (input.exchange.status === "canceled") return "canceled"
  if (input.returnRejected) return "rejected"
  if (input.exchange.status === "shipment_created" && input.shipment && !input.shipment.canceled) {
    if (input.shipment.delivered) return "delivered"
    if (input.shipment.shipped) return "shipped"
    return "label_ready"
  }
  if (input.returnCanceled) return "canceled"
  if (input.exchange.status === "failed") return "failed"
  return input.returnReceived ? "to_ship" : "awaiting_return"
}

