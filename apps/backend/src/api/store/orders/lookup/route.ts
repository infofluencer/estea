import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"
import { parseOrderNumber } from "@escay/shared/order-number"
import { pendingBankTransferForOrder } from "../../../../lib/bank-transfer"
import {
  normalizeEmail,
  orderNotFound,
  STORE_ORDER_RETRIEVE_FIELDS,
} from "../_shared"

type LookupBody = {
  id: string
  email: string
}

/**
 * Guest order lookup: POST /store/orders/lookup
 * Body: { id, email } — email is NOT accepted as a query string (avoid access logs).
 *
 * `id` accepts Medusa order id (`order_…`), plain display_id (`3`), or
 * customer-facing 6-digit form (`100003` / `#100003`) — parsed via shared helper.
 *
 * Returns the order only when the submitted email matches the order email
 * (trim + case-insensitive). Otherwise the same 404 as a missing order.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id, email } = (req.validatedBody || req.body) as LookupBody
  const provided = normalizeEmail(email)
  const parsed = parseOrderNumber(id)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  let orderId: string | undefined

  if (parsed.kind === "order_id") {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "email"],
      filters: { id: parsed.orderId, is_draft_order: false },
    })
    const row = data?.[0] as { id?: string; email?: string | null } | undefined
    const stored = normalizeEmail(row?.email)
    if (!row?.id || !stored || stored !== provided) {
      orderNotFound()
    }
    orderId = row.id
  } else if (parsed.kind === "display_id") {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "email", "display_id"],
      filters: {
        // Medusa query graph types display_id as string filter
        display_id: String(parsed.displayId) as unknown as string,
        is_draft_order: false,
      },
    })
    const row = data?.[0] as unknown as
      | { id?: string; email?: string | null; display_id?: number | string }
      | undefined
    const stored = normalizeEmail(row?.email)
    if (!row?.id || !stored || stored !== provided) {
      orderNotFound()
    }
    orderId = row.id
  } else {
    orderNotFound()
  }

  const { result } = await getOrderDetailWorkflow(req.scope).run({
    input: {
      fields: STORE_ORDER_RETRIEVE_FIELDS,
      order_id: orderId!,
      filters: { is_draft_order: false },
    },
  })

  // getOrderDetailWorkflow often omits returns — attach for RMA status UI
  const { data: returns } = await query.graph({
    entity: "return",
    fields: ["id", "status", "created_at", "order_id", "metadata", "items.item_id"],
    filters: { order_id: orderId! },
  })

  res.status(200).json({
    order: {
      ...(result as unknown as Record<string, unknown>),
      returns: returns || [],
      bank_transfer: await pendingBankTransferForOrder(req.scope, orderId!),
    },
  })
}
