import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getConfiguredCarrier } from "../../../../../modules/carrier/registry"
import { readFulfillmentData } from "../../../../../modules/carrier/types"

/**
 * GET /admin/orders/:id/fulfillment — kargo kutusu için özet
 * { paid, canceled, has_fulfillment, carrier_configured, carrier, active }
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "payment_collections.status",
      "fulfillments.id",
      "fulfillments.canceled_at",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.data",
    ],
    filters: { id: req.params.id },
  })
  const order = data?.[0] as
    | {
        status?: string | null
        payment_collections?: { status?: string | null }[] | null
        fulfillments?: { id: string; canceled_at?: unknown; shipped_at?: unknown; delivered_at?: unknown; data?: Record<string, unknown> | null }[] | null
      }
    | undefined
  if (!order) return res.status(404).json({ message: "Sipariş bulunamadı" })

  const paid = (order.payment_collections || []).some((p) =>
    ["captured", "completed", "authorized"].includes((p.status || "").toLowerCase())
  )
  const active = (order.fulfillments || []).find((f) => !f.canceled_at)
  const adapter = getConfiguredCarrier()
  res.json({
    paid,
    canceled: (order.status || "").toLowerCase() === "canceled",
    has_fulfillment: Boolean(active),
    carrier_configured: Boolean(adapter),
    carrier: adapter ? { code: adapter.code, name: adapter.name } : null,
    active: active
      ? { id: active.id, shipped: Boolean(active.shipped_at), delivered: Boolean(active.delivered_at), data: readFulfillmentData(active.data) }
      : null,
  })
}
