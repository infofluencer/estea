import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { createStoreReturnRequest } from "../../../../store/returns/_create-return"
import { loadExchangeOptions } from "../../../../../lib/exchange"

/** GET /admin/orders/:id/exchange — her kalem için seçilebilecek varyantlar (stok adediyle). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({ items: await loadExchangeOptions(req.scope, req.params.id) })
}

type Body = {
  items?: { item_id: string; quantity: number; variant_id: string }[]
  reason_id?: string | null
  note?: string | null
}

/** Varsayılan sebep: "Yanlış gramaj / çeşit seçtim" (seed: wrong_variant), yoksa ilk sebep. */
async function defaultReasonId(req: AuthenticatedMedusaRequest): Promise<string | null> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "return_reason", fields: ["id", "value"] })
  const rows = data as { id: string; value?: string | null }[]
  return (
    rows.find((r) => r.value === "wrong_variant")?.id ||
    rows.find((r) => r.value === "wrong_size_color")?.id || // eski seed
    rows[0]?.id ||
    null
  )
}

/**
 * POST /admin/orders/:id/exchange — panelden değişim (müşteri telefonla / mesajla
 * istediğinde, eski siparişler dahil). İade talebi + değişim kaydı açılır; iade
 * kodu ve teslim alma normal iade gibi. Teslim edilmiş adet kadar açılabilir.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as Body
  const items = Array.isArray(body.items) ? body.items : []
  try {
    const reasonId = body.reason_id || (await defaultReasonId(req))
    if (!reasonId) throw new Error("İade sebebi tanımlı değil.")
    const created = await createStoreReturnRequest(req.scope, {
      order_id: req.params.id,
      items: items.map((i) => ({
        id: i.item_id,
        quantity: Math.floor(Number(i.quantity || 0)),
        exchange_variant_id: i.variant_id,
      })),
      reason_id: reasonId,
      note: body.note,
      source: "admin",
      created_by: req.auth_context?.actor_id || null,
    })
    res.json({ return: created })
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) })
  }
}
