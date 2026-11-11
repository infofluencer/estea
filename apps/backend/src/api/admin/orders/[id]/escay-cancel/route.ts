import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { cancelUnshippedOrder } from "../../../../../lib/order-cancel"

/**
 * POST /admin/orders/:id/escay-cancel — kargoya verilmemiş siparişi iptal et:
 * kargo kaydı firmada iptal, para iadesi, müşteriye mail. Medusa'nın /cancel
 * ucundan ayrı (o kargo firmasına dokunmaz, açık gönderide hata verir).
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const body = (req.body || {}) as { reason?: string | null }
  const result = await cancelUnshippedOrder(req.scope, {
    orderId: req.params.id,
    reason: body.reason,
    actorId: req.auth_context?.actor_id || null,
  })
  res.json({ ok: true, ...result })
}
