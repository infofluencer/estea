import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows"
import { BANK_TRANSFER_METHOD } from "../../../lib/bank-transfer"
import { PENDING_BANK_TRANSFER_LIST_STATUS } from "./bank-transfer-list-status"

/**
 * Admin sipariş listesi "Filtre Ekle" → Ödeme durumu / Kargo durumu.
 *
 * Medusa v2'de payment_status / fulfillment_status hesaplanan alanlar; liste
 * API'si bunlarla filtrelemiyor (dashboard'da da yoruma alınmış — yama:
 * scripts/patch-dashboard-order-filters.mjs). Burada seçilen durumlar,
 * listedeki sütunla aynı hesaplamayla sipariş id'lerine çevrilir ve `id`
 * filtresi olarak core route'a geçer. Ödenmemiş havale, liste sütunundaki gibi
 * "requires_action" (Havale onayı bekleniyor) sayılır.
 */

/** Tek istekte taranan en fazla sipariş (durum hesaplaması). */
const MAX_SCAN = 5000
/** Eşleşme yoksa core route'a boş liste döndürtmek için. */
const NO_MATCH_ID = "order_none"

type StatusRow = {
  id: string
  payment_status?: string | null
  fulfillment_status?: string | null
  metadata?: Record<string, unknown> | null
}

function toList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]
  return values
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim())
    .filter(Boolean)
}

/** Listede görünen ödeme durumu (ödenmemiş havale → requires_action). */
export function displayedPaymentStatus(row: StatusRow): string {
  const status = String(row.payment_status ?? "")
  if (status === "awaiting" && row.metadata?.payment_method === BANK_TRANSFER_METHOD) {
    return PENDING_BANK_TRANSFER_LIST_STATUS
  }
  return status
}

/** Seçilen ödeme / kargo durumlarına uyan sipariş id'leri (boş seçim = filtre yok). */
export function matchOrderIds(rows: StatusRow[], payment: string[], fulfillment: string[]): string[] {
  const pay = new Set(payment)
  const ful = new Set(fulfillment)
  return rows
    .filter((row) => !pay.size || pay.has(displayedPaymentStatus(row)))
    .filter((row) => !ful.size || ful.has(String(row.fulfillment_status ?? "")))
    .map((row) => row.id)
}

export async function filterOrdersByStatus(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const query = req.query as Record<string, unknown>
  const payment = toList(query.payment_status)
  const fulfillment = toList(query.fulfillment_status)
  if (!payment.length && !fulfillment.length) return next()

  // Core doğrulaması bu anahtarları tanımıyor → id filtresine çevrilir.
  delete query.payment_status
  delete query.fulfillment_status

  try {
    const { result } = await getOrdersListWorkflow(req.scope).run({
      input: {
        fields: ["id", "payment_status", "fulfillment_status", "metadata"],
        variables: { filters: { is_draft_order: false }, skip: 0, take: MAX_SCAN },
      },
    })
    const rows = (Array.isArray(result) ? result : (result as { rows?: StatusRow[] }).rows ?? []) as StatusRow[]
    let ids = matchOrderIds(rows, payment, fulfillment)

    // Başka bir id filtresi varsa kesişim alınır.
    const existing = toList(query.id)
    if (existing.length) ids = ids.filter((id) => existing.includes(id))
    const target = ids.length ? ids : [NO_MATCH_ID]

    // Middleware doğrulamadan önce çalışırsa req.query, sonra çalışırsa filterableFields kullanılır.
    query.id = target
    const filterable = (req as unknown as { filterableFields?: Record<string, unknown> }).filterableFields
    if (filterable) filterable.id = target
    next()
  } catch (error) {
    next(error)
  }
}
