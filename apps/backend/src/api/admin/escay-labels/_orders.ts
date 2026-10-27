import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { buildLabelsPdf, type LabelPage } from "../../../lib/label-pdf"
import { getConfiguredCarrier } from "../../../modules/carrier/registry"
import type { LabelOrder } from "../../../lib/order-packing-label"

/** Tek istekte en fazla bu kadar sipariş (toplu baskı). */
export const MAX_LABEL_ORDERS = 200

export const LABEL_ORDER_FIELDS = [
  "id",
  "display_id",
  "created_at",
  "email",
  "metadata",
  "shipping_address.*",
  "items.id",
  "items.title",
  "items.product_title",
  "items.variant_title",
  "items.variant_sku",
  "items.quantity",
  // Satır adedi order_item (detail) tablosunda; line item kolonu boş gelebilir.
  "items.detail.quantity",
  "items.variant.sku",
  "items.variant.options.value",
  "items.variant.options.option.title",
  "fulfillments.id",
  "fulfillments.canceled_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.data",
  "fulfillments.labels.*",
]

/** `?ids=a,b,c` → sipariş id listesi (tekrarsız, sıra korunur). */
export function parseOrderIds(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw]
  const ids = values
    .flatMap((v) => String(v ?? "").split(","))
    .map((v) => v.trim())
    .filter(Boolean)
  return [...new Set(ids)]
}

/** `?slip=1` → kargo etiketinin arkasına sipariş fişi sayfası eklenir. */
export function wantsSlip(raw: unknown): boolean {
  return raw === "1" || raw === "true"
}

/** Siparişleri istenen sırada döndürür; bulunamayanlar atlanır. */
export async function loadLabelOrders(
  req: MedusaRequest,
  ids: string[]
): Promise<Record<string, unknown>[]> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: LABEL_ORDER_FIELDS,
    filters: { id: ids },
  })
  const byId = new Map((data as Record<string, unknown>[]).map((o) => [String(o.id), o]))
  return ids.map((id) => byId.get(id)).filter((o): o is Record<string, unknown> => Boolean(o))
}

/**
 * Etiketi basılan siparişlere `metadata.label_printed_at` yazar (admin
 * "Etiket yazdırıldı" rozeti / filtresi). Hata etiketi engellemez.
 */
export async function markLabelsPrinted(
  req: MedusaRequest,
  orders: Record<string, unknown>[],
  printedIds: string[]
): Promise<void> {
  if (!printedIds.length) return
  const logger = req.scope.resolve("logger")
  const printed = new Set(printedIds)
  const now = new Date().toISOString()
  const orderModule = req.scope.resolve(Modules.ORDER) as {
    updateOrders: (data: { id: string; metadata: Record<string, unknown> }[]) => Promise<unknown>
  }
  try {
    await orderModule.updateOrders(
      orders
        .filter((o) => printed.has(String(o.id)))
        .map((o) => ({
          id: String(o.id),
          metadata: { ...((o.metadata as Record<string, unknown> | null) || {}), label_printed_at: now },
        }))
    )
  } catch (error) {
    logger.warn(`[labels] etiket yazdırıldı işareti kaydedilemedi: ${String(error)}`)
  }
}

/** Aynı anda en fazla bu kadar kargo etiketi indirilir (toplu baskı). */
const LABEL_FETCH_CONCURRENCY = 6

async function fetchPdf(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = Buffer.from(await response.arrayBuffer())
  if (body.subarray(0, 5).toString() !== "%PDF-") throw new Error("PDF değil")
  return body
}

/** Siparişin kargo firması etiketi (PDF). Gönderi yoksa null. */
async function carrierPdf(order: LabelOrder): Promise<Buffer | null> {
  if (order.carrierLabelUrl) return fetchPdf(order.carrierLabelUrl)
  if (order.carrierLabelZpl) {
    const adapter = getConfiguredCarrier()
    if (!adapter?.getLabel) throw new Error("ZPL etiket PDF'e çevrilemiyor (adaptör getLabel yok)")
    const out = await adapter.getLabel({ label_zpl: order.carrierLabelZpl }, "pdf")
    return Buffer.isBuffer(out) ? out : Buffer.from(out)
  }
  if (order.shipment) throw new Error("kargo etiketi adresi yok")
  return null
}

/**
 * Etiket PDF'ini gönderir: her sipariş için kargo etiketi olduğu gibi; `withSlip`
 * ise arkasında sipariş fişi sayfası.
 * Kargo etiketi alınamayan siparişler uyarılı fişle basılır ve
 * `X-Escay-Skipped` başlığında döner (admin uyarı gösterir). `onPrinted`,
 * kargo etiketi PDF'e giren siparişlerin id'leriyle çağrılır.
 */
export async function sendLabelsPdf(
  req: MedusaRequest,
  res: MedusaResponse,
  labels: LabelOrder[],
  withSlip = false,
  onPrinted?: (orderIds: string[]) => Promise<void>
) {
  const logger = req.scope.resolve("logger")
  const pages: LabelPage[] = new Array(labels.length)
  const skipped: string[] = []

  let next = 0
  const worker = async () => {
    while (next < labels.length) {
      const i = next++
      const order = labels[i]
      try {
        pages[i] = { order, carrierPdf: await carrierPdf(order) }
      } catch (error) {
        const name = order.shipment?.orderNumber || `#${order.displayId || order.id}`
        logger.warn(`[labels] ${name} kargo etiketi alınamadı: ${String(error)}`)
        skipped.push(name)
        pages[i] = {
          order,
          carrierPdf: null,
          warning: "KARGO ETİKETİ ALINAMADI — firmanın etiketini kendi panelinden basın.",
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LABEL_FETCH_CONCURRENCY, labels.length) }, worker))

  const pdf = await buildLabelsPdf(pages, { withSlip })
  if (onPrinted) await onPrinted(pages.filter((p) => p.carrierPdf).map((p) => p.order.id))
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Access-Control-Expose-Headers", "X-Escay-Skipped")
  if (skipped.length) res.setHeader("X-Escay-Skipped", encodeURIComponent(skipped.join(", ")))
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `inline; filename="etiketler.pdf"`)
  return res.send(pdf)
}
