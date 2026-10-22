import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { acceptReturnItems, type AcceptanceInput } from "../../../../../lib/return-acceptance"

/**
 * POST /admin/returns/:id/accept — ürün bazlı teslim alma.
 * Body: { items: [{ item_id, restock_quantity, damaged_quantity }], reason?, refund_shipping? }
 * Kabul edilenler için para iadesi otomatik (order.return_received); kabul edilmeyenler iade almaz.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as {
    items?: AcceptanceInput[]
    reason?: string | null
    refund_shipping?: boolean
  }
  try {
    const result = await acceptReturnItems(req.scope, {
      return_id: req.params.id,
      items: Array.isArray(body.items) ? body.items : [],
      reason: body.reason,
      refund_shipping: body.refund_shipping === true,
      actor_id: req.auth_context?.actor_id || null,
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) })
  }
}
