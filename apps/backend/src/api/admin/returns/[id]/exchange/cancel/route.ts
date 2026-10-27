import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { cancelExchange } from "../../../../../../lib/exchange"

/**
 * POST /admin/returns/:id/exchange/cancel — değişimi iptal et (yeni ürün
 * eklenmeden önce). Body: { refund?: boolean } — iade teslim alındıysa parayı iade et.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as { refund?: boolean }
  try {
    const result = await cancelExchange(req.scope, {
      return_id: req.params.id,
      actor: req.auth_context?.actor_id || null,
      refund: body.refund === true,
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) })
  }
}
