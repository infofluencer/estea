import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { convertReturnToExchange } from "../../../../../lib/exchange"

/**
 * POST /admin/returns/:id/exchange — var olan iadeyi değişime çevir.
 * Body: { items: [{ item_id, variant_id, quantity? }] } (adet yoksa iadedeki adet).
 * İade teslim alınmışsa yeni ürünün gönderisi hemen açılır; para iadesi yapılmaz.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as { items?: { item_id: string; variant_id: string; quantity?: number }[] }
  try {
    const result = await convertReturnToExchange(req.scope, {
      return_id: req.params.id,
      items: Array.isArray(body.items) ? body.items : [],
      actor: req.auth_context?.actor_id || null,
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) })
  }
}
