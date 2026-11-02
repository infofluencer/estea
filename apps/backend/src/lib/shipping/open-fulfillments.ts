import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { readFulfillmentData } from "../../modules/carrier/types"

/**
 * Fulfillment kayıtlarını sayfalayarak okur ve taşıyıcı kimliğiyle eşleştirir.
 *
 * Mareen dersi: webhook eşleşmesi "son 200 kayıt"ta arıyordu; sipariş sayısı
 * arttıkça eski gönderilerin teslim bildirimi kaçıyordu. Burada:
 *   1. takip numarası `fulfillment_label.tracking_number` üzerinden doğrudan sorgulanır,
 *   2. bulunamazsa teslim edilmemiş kayıtlar SAYFALANARAK taranır (sabit üst sınır yok,
 *      yalnız geriye dönük gün penceresi).
 */

export type FulfillmentRow = {
  id: string
  created_at?: string | Date | null
  shipped_at?: string | Date | null
  delivered_at?: string | Date | null
  canceled_at?: string | Date | null
  data?: Record<string, unknown> | null
}

type PageOptions = {
  /** Yalnız bu tarihten sonra açılanlar (ISO). */
  since?: string
  pageSize?: number
  /** Güvenlik sınırı — pageSize × maxPages kayıttan fazlası taranmaz. */
  maxPages?: number
  /** Her sayfa sonrası; true dönerse tarama durur. */
  until?: (rows: FulfillmentRow[]) => boolean
  /** Ek filtreler (ör. { delivered_at: null }). Sorgu reddederse filtresiz tekrar denenir. */
  filters?: Record<string, unknown>
}

const FIELDS = ["id", "created_at", "shipped_at", "delivered_at", "canceled_at", "data"]

export async function listFulfillmentsPaged(
  container: MedusaContainer,
  opts: PageOptions = {}
): Promise<FulfillmentRow[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const take = opts.pageSize ?? 200
  const maxPages = opts.maxPages ?? 100
  const baseFilters: Record<string, unknown> = { ...(opts.filters || {}) }
  if (opts.since) baseFilters.created_at = { $gte: opts.since }

  const scan = async (filters: Record<string, unknown>): Promise<FulfillmentRow[]> => {
    const out: FulfillmentRow[] = []
    for (let page = 0; page < maxPages; page++) {
      const { data } = await query.graph({
        entity: "fulfillment",
        fields: FIELDS,
        filters,
        pagination: { take, skip: page * take, order: { created_at: "DESC" } },
      })
      const rows = (data as FulfillmentRow[]) || []
      out.push(...rows)
      if (opts.until?.(rows)) break
      if (rows.length < take) break
    }
    return out
  }

  try {
    return await scan(baseFilters)
  } catch (error) {
    // Ek filtre (ör. null eşitliği) sorgu tarafından reddedildiyse filtresiz tara.
    if (!opts.filters || !Object.keys(opts.filters).length) throw error
    return scan(opts.since ? { created_at: { $gte: opts.since } } : {})
  }
}

/** Açık (iptal/teslim edilmemiş) gönderiler — yoklama ve denetim için. */
export async function listOpenFulfillments(
  container: MedusaContainer,
  opts: { lookbackDays?: number } = {}
): Promise<FulfillmentRow[]> {
  const since = new Date(Date.now() - (opts.lookbackDays ?? 60) * 86_400_000).toISOString()
  const rows = await listFulfillmentsPaged(container, { since, filters: { delivered_at: null } })
  return rows.filter((f) => !f.canceled_at && !f.delivered_at)
}

export async function orderIdForFulfillment(container: MedusaContainer, fulfillmentId: string): Promise<string | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order_fulfillment",
    fields: ["order_id", "fulfillment_id"],
    filters: { fulfillment_id: fulfillmentId },
  })
  return (data?.[0] as { order_id?: string } | undefined)?.order_id || null
}

export type CarrierRefLookup = {
  /** Adaptör kodu; verilirse yalnız o adaptörün kayıtları eşleşir. */
  carrierCode?: string | null
  shipmentRef?: string | null
  /** Takip no / barkod adayları (etiket tablosunda aranır). */
  trackingNumbers?: (string | null | undefined)[]
  /** Sipariş referansı (ESC-65) — önce bu siparişin kayıtlarına bakılır. */
  orderReference?: string | null
  lookbackDays?: number
}

export type MatchedFulfillment = { id: string; orderId: string | null; row: FulfillmentRow }

function matcher(lookup: CarrierRefLookup) {
  const ref = (lookup.shipmentRef || "").trim()
  const tracking = new Set((lookup.trackingNumbers || []).map((t) => (t || "").trim()).filter(Boolean))
  const code = (lookup.carrierCode || "").trim().toLowerCase()
  return (row: FulfillmentRow): boolean => {
    if (row.canceled_at) return false
    const d = readFulfillmentData(row.data)
    if (code && (d.carrier || "") !== code) return false
    if (ref && d.shipment_ref === ref) return true
    if (tracking.size && (tracking.has(d.tracking_number || "") || tracking.has(d.barcode || ""))) return true
    return false
  }
}

export function displayIdFromReference(reference: string | null | undefined): number | null {
  const digits = (reference || "").trim().replace(/-D$/i, "").replace(/[^0-9]/g, "")
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Taşıyıcı kimliğiyle fulfillment bul: sipariş referansı → etiket tablosu → sayfalı tarama.
 */
export async function findFulfillmentByCarrierRef(
  container: MedusaContainer,
  lookup: CarrierRefLookup
): Promise<MatchedFulfillment | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const matches = matcher(lookup)

  const displayId = displayIdFromReference(lookup.orderReference)
  if (displayId) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "fulfillments.*"],
      // Medusa query graph display_id filtresini string bekler (bkz. store/orders/lookup)
      filters: { display_id: String(displayId) },
    })
    for (const o of (orders || []) as { id: string; fulfillments?: FulfillmentRow[] }[]) {
      const f = (o.fulfillments || []).find(matches)
      if (f) return { id: f.id, orderId: o.id, row: f }
    }
  }

  const candidates = [lookup.shipmentRef, ...(lookup.trackingNumbers || [])]
    .map((t) => (t || "").trim())
    .filter(Boolean)
  if (candidates.length) {
    try {
      const { data: labels } = await query.graph({
        entity: "fulfillment_label",
        fields: ["id", "tracking_number", "fulfillment_id"],
        filters: { tracking_number: candidates },
      })
      const ids = [...new Set(((labels || []) as { fulfillment_id?: string }[]).map((l) => l.fulfillment_id).filter(Boolean))] as string[]
      if (ids.length) {
        const { data: rows } = await query.graph({ entity: "fulfillment", fields: FIELDS, filters: { id: ids } })
        const f = ((rows || []) as FulfillmentRow[]).find((row) => {
          if (row.canceled_at) return false
          const d = readFulfillmentData(row.data)
          const code = (lookup.carrierCode || "").toLowerCase()
          return !code || (d.carrier || "") === code
        })
        if (f) return { id: f.id, orderId: await orderIdForFulfillment(container, f.id), row: f }
      }
    } catch {
      /* etiket tablosu sorgulanamadı → tarama */
    }
  }

  let found: FulfillmentRow | undefined
  const since = new Date(Date.now() - (lookup.lookbackDays ?? 365) * 86_400_000).toISOString()
  await listFulfillmentsPaged(container, {
    since,
    filters: { delivered_at: null },
    until: (rows) => {
      found = rows.find(matches)
      return Boolean(found)
    },
  })
  if (!found) return null
  return { id: found.id, orderId: await orderIdForFulfillment(container, found.id), row: found }
}
