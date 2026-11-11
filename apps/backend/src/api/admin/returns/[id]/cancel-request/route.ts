import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { cancelStoreReturn } from "../../../../../lib/return-cancel"

/** POST /admin/returns/:id/cancel-request — teslim alınmamış iade talebini iptal et (mail yok,
 * Es Çay metadata + olay kaydı). Medusa'nın /cancel ucundan ayrı tutulur. */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const body = (req.body || {}) as { reason?: string | null }
  const result = await cancelStoreReturn(req.scope, {
    return_id: req.params.id,
    reason: body.reason,
    canceled_by: req.auth_context?.actor_id || null,
  })
  res.json({ ok: true, ...result })
}
