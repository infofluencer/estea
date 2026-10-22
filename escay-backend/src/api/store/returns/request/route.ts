import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { orderNotFound } from "../../orders/_shared"
import { createStoreReturnRequest } from "../_create-return"

type CustomerReturnBody = {
  order_id: string
  items: { id: string; quantity: number }[]
  reason_id: string
  note?: string | null
}

/**
 * Authenticated customer return: POST /store/returns/request
 *
 * Core POST /store/returns requires return_shipping — unused in v1.
 * Ownership-checked; customer ships themselves.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Unauthorized")
  }

  const body = (req.validatedBody || req.body) as CustomerReturnBody
  const orderId = String(body.order_id || "").trim()

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: orderId, is_draft_order: false },
  })
  const row = data?.[0] as { id?: string; customer_id?: string | null } | undefined

  if (!row?.id || row.customer_id !== customerId) {
    orderNotFound()
  }

  const created = await createStoreReturnRequest(req.scope, {
    order_id: orderId,
    items: body.items,
    reason_id: body.reason_id,
    note: body.note,
    source: "customer",
    created_by: customerId,
  })

  res.status(200).json({ return: created })
}
