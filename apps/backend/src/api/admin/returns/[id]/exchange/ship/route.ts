import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { shipExchange } from "../../../../../../lib/exchange"

/** POST /admin/returns/:id/exchange/ship — yeni ürünün gönderisini aç / tekrar dene. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const result = await shipExchange(req.scope, {
    return_id: req.params.id,
    actor: req.auth_context?.actor_id || null,
  })
  if (!result.ok) return res.status(400).json({ message: result.message })
  res.json(result)
}
