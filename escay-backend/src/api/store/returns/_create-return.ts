import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  beginReturnOrderWorkflow,
  confirmReturnRequestWorkflow,
  requestItemReturnWorkflow,
} from "@medusajs/medusa/core-flows"
import { resolveDefaultStockLocationId } from "../../../lib/default-stock-location"
import { buildExchangeItems, newExchangeMeta } from "../../../lib/exchange"
import { EXCHANGE_META_KEY, type ExchangeMeta } from "../../../lib/exchange-plan"
import { isReturnRejected } from "../../../lib/return-rejection"

export type ReturnRequestItemInput = {
  id: string
  quantity: number
  /** Değişim talebinde gönderilecek yeni varyant (aynı ürün, başka beden/renk). */
  exchange_variant_id?: string | null
}

export type CreateStoreReturnInput = {
  order_id: string
  items: ReturnRequestItemInput[]
  reason_id: string
  note?: string | null
  source: "customer" | "guest" | "admin"
  created_by?: string | null
  /**
   * Yalnız test betikleri: reddedilmiş iadedeki ürüne yeniden iade.
   * Sadece RETURN_TEST_EMAILS'teki e-postalı siparişlerde geçerli.
   */
  allowPreviouslyRejected?: boolean
}

/** Reddedilmiş ürüne yeniden iade açılabilen test hesapları. */
const RETURN_TEST_EMAILS = new Set(["yusufhkrann@gmail.com"])

export type StoreReturnResult = {
  id: string
  status?: string | null
  order_id: string
  created_at?: string | Date | null
  items?: unknown
  metadata?: Record<string, unknown> | null
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  if (value != null && typeof value === "object" && "value" in value) {
    return Number((value as { value: unknown }).value)
  }
  if (value != null && typeof (value as { toString?: () => string }).toString === "function") {
    return Number(String(value))
  }
  return Number(value) || 0
}

/**
 * Teslim edilmiş − daha önce iade talep/alınmış = iade edilebilir adet.
 * Müşteri ürünü almadan iade açamaz: kargoya verilmemiş sipariş iptal edilir,
 * yoldaki sipariş teslim bekler (gecikmede admin "Teslim edildi" yapar).
 */
export function returnableQuantity(detail: Record<string, unknown> | null | undefined): number {
  if (!detail) return 0
  const delivered = asNumber(detail.delivered_quantity)
  const already =
    asNumber(detail.return_requested_quantity) +
    asNumber(detail.return_received_quantity) +
    asNumber(detail.return_dismissed_quantity)
  return Math.max(0, delivered - already)
}

type OrderReturnRow = {
  metadata?: Record<string, unknown> | null
  items?: { item_id?: string | null }[] | null
}

/** Reddedilmiş iadelerdeki sipariş kalemleri — bunlar için siteden yeni talep açılmaz. */
export function rejectedReturnItemIds(returns: OrderReturnRow[] | null | undefined): Set<string> {
  const ids = new Set<string>()
  for (const r of returns || []) {
    if (!isReturnRejected(r.metadata)) continue
    for (const it of r.items || []) if (it.item_id) ids.add(it.item_id)
  }
  return ids
}

// Aynı sipariş için eşzamanlı talep (çift tıklama) — tek backend süreci.
const ordersInFlight = new Set<string>()

/**
 * Müşteri iade talebi: begin → request items → confirm.
 *
 * confirmReturnRequestWorkflow → order.return_requested:
 *   - (adaptör createReturn sunuyorsa) otomatik iade kodu
 *   - müşteri + satıcı maili
 * Refund YOK — ürün gelince order.return_received → PayTR.
 */
export async function createStoreReturnRequest(
  scope: MedusaContainer,
  input: CreateStoreReturnInput
): Promise<StoreReturnResult> {
  if (ordersInFlight.has(input.order_id)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "İade talebiniz işleniyor, lütfen bekleyin."
    )
  }
  ordersInFlight.add(input.order_id)
  try {
    return await createStoreReturnRequestUnlocked(scope, input)
  } finally {
    ordersInFlight.delete(input.order_id)
  }
}

async function createStoreReturnRequestUnlocked(
  scope: MedusaContainer,
  input: CreateStoreReturnInput
): Promise<StoreReturnResult> {
  const { order_id, items, reason_id, note, source, created_by } = input

  if (!items?.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "En az bir ürün seçilmelidir."
    )
  }

  if (!reason_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "İade sebebi zorunludur."
    )
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  // items.detail.* alone may only return id/item_id — qty fields must be explicit.
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "email",
      "items.id",
      "items.quantity",
      // Sipariş kalemi adedi order_item'da (detail) durur; yalnız "items.quantity"
      // istenirse Medusa adedi boş döner ve toplamlar 0 hesaplanır.
      "items.detail.quantity",
      "items.detail.fulfilled_quantity",
      "items.detail.shipped_quantity",
      "items.detail.delivered_quantity",
      "items.detail.return_requested_quantity",
      "items.detail.return_received_quantity",
      "items.detail.return_dismissed_quantity",
    ],
    filters: { id: order_id, is_draft_order: false },
  })

  const order = orders?.[0] as
    | {
        id?: string
        status?: string
        email?: string | null
        items?: {
          id?: string
          quantity?: number
          detail?: Record<string, unknown> | null
        }[]
      }
    | undefined

  if (!order?.id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  }

  if (order.status === "canceled") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "İptal edilmiş sipariş için iade açılamaz."
    )
  }

  const byId = new Map(
    (order.items || []).map((item) => [item.id as string, item])
  )

  const { data: previousReturns } = await query.graph({
    entity: "return",
    fields: ["id", "metadata", "items.item_id"],
    filters: { order_id },
  })
  const rejectedItems = rejectedReturnItemIds(previousReturns as OrderReturnRow[])
  const testAccount =
    input.allowPreviouslyRejected === true &&
    RETURN_TEST_EMAILS.has(String(order.email || "").trim().toLowerCase())
  if (!testAccount && items.some((item) => rejectedItems.has(item.id))) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Bu ürün için iade talebiniz daha önce değerlendirildi. Sorunuz varsa lütfen bizimle iletişime geçin."
    )
  }

  // Aynı satır birden çok kez gönderilirse adetler toplanarak kontrol edilir;
  // aksi halde her kopya ayrı ayrı max'ı geçip daha önce iade alınmış adet tekrar istenebilir.
  const requestedByLine = new Map<string, number>()
  for (const item of items) {
    const line = byId.get(item.id)
    if (!line) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Seçilen ürün bu siparişte yok."
      )
    }
    const maxQty = returnableQuantity(line.detail)
    const total = (requestedByLine.get(item.id) ?? 0) + item.quantity
    requestedByLine.set(item.id, total)
    if (item.quantity < 1 || total > maxQty) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `İade adedi geçersiz (max ${maxQty}).`
      )
    }
  }

  // Değişim: tüm kalemlerde yeni varyant seçili olmalı (iade + değişim ayrı talep).
  const exchangeCount = items.filter((i) => i.exchange_variant_id).length
  if (exchangeCount && exchangeCount !== items.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Değişim talebinde her ürün için yeni beden/renk seçin (iade ve değişim ayrı talep olarak açılır)."
    )
  }
  let exchange: ExchangeMeta | null = null
  if (exchangeCount) {
    try {
      exchange = newExchangeMeta(
        await buildExchangeItems(
          scope,
          order_id,
          items.map((i) => ({ item_id: i.id, quantity: i.quantity, variant_id: String(i.exchange_variant_id) }))
        ),
        source,
        created_by ?? null
      )
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  const trimmedNote = typeof note === "string" ? note.trim().slice(0, 500) : ""

  // Native confirm-receive restock uses return.location_id — without it stock stays flat.
  const locationId = await resolveDefaultStockLocationId(scope)
  if (!locationId) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Stok lokasyonu bulunamadı; iade açılamaz."
    )
  }

  const { result: orderChange } = await beginReturnOrderWorkflow(scope).run({
    input: {
      order_id,
      location_id: locationId,
      created_by: created_by ?? null,
      description: trimmedNote || undefined,
      metadata: {
        source,
        customer_note: trimmedNote || null,
        ...(exchange ? { [EXCHANGE_META_KEY]: exchange } : {}),
      },
    },
  })

  const returnId = (orderChange as { return_id?: string }).return_id
  if (!returnId) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "İade kaydı oluşturulamadı."
    )
  }

  await requestItemReturnWorkflow(scope).run({
    input: {
      return_id: returnId,
      items: items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        reason_id,
        internal_note: trimmedNote || null,
        metadata: trimmedNote ? { customer_note: trimmedNote } : undefined,
      })),
    },
  })

  await confirmReturnRequestWorkflow(scope).run({
    input: {
      return_id: returnId,
      confirmed_by: created_by ?? undefined,
    },
  })

  const { data: returns } = await query.graph({
    entity: "return",
    fields: [
      "id",
      "status",
      "order_id",
      "created_at",
      "metadata",
      "items.*",
    ],
    filters: { id: returnId },
  })

  const created = returns?.[0] as StoreReturnResult | undefined
  if (!created?.id) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "İade kaydı okunamadı."
    )
  }

  return created
}
