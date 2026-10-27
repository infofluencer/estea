import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { normalizeEmail, orderNotFound } from "../../orders/_shared"
import { createStoreReturnRequest } from "../_create-return"

type GuestReturnBody = {
  order_id: string
  email: string
  items: { id: string; quantity: number }[]
  reason_id: string
  note?: string | null
}

/**
 * Guest return request: POST /store/returns/guest
 * Body: { order_id, email, items[], reason_id, note? }
 *
 * Email+order match mirrors /store/orders/lookup (generic 404 on mismatch).
 * Creates a Medusa Return via begin → request items → confirm (no return shipping).
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.validatedBody || req.body) as GuestReturnBody
  const orderId = String(body.order_id || "").trim()
  const provided = normalizeEmail(body.email)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "email"],
    filters: { id: orderId, is_draft_order: false },
  })
  const row = data?.[0] as { id?: string; email?: string | null } | undefined
  const stored = normalizeEmail(row?.email)

  if (!row?.id || !stored || stored !== provided) {
    orderNotFound()
  }

  const created = await createStoreReturnRequest(req.scope, {
    order_id: orderId,
    items: body.items,
    reason_id: body.reason_id,
    note: body.note,
    source: "guest",
  })

  res.status(200).json({ return: created })
}
