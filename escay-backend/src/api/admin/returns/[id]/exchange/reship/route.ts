import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { reshipExchange } from "../../../../../../lib/exchange"

/**
 * POST /admin/returns/:id/exchange/reship — kargoya verilmemiş değişim
 * gönderisini iptal edip yenisini açar (eski etiket geçersiz olur).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const result = await reshipExchange(req.scope, {
      return_id: req.params.id,
      actor: req.auth_context?.actor_id || null,
    })
    if (!result.ok) return res.status(400).json({ message: result.message })
    res.json(result)
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) })
  }
}
