import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"
import { pendingBankTransferForOrder } from "../../../../lib/bank-transfer"
import {
  tryLinkGuestOrdersToRegisteredCustomer,
  verifiedEmailForAuthIdentity,
} from "../../../../lib/link-guest-orders"
import {
  orderNotFound,
  STORE_ORDER_RETRIEVE_FIELDS,
} from "../_shared"

/**
 * Override of core GET /store/orders/:id.
 *
 * Core route is unauthenticated (Medusa source even has a TODO). Anyone with an
 * order ID could read PII. Logged-in customers may only retrieve their own order.
 * Guests must use POST /store/orders/lookup with order ID + email.
 *
 * Actor JWT implies email verification. Link same-email guest orders first so
 * a just-verified member can open a pre-registration order by id.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Unauthorized")
  }

  await tryLinkGuestOrdersToRegisteredCustomer(req.scope, {
    registeredCustomerId: customerId,
    email: await verifiedEmailForAuthIdentity(
      req.scope,
      req.auth_context?.auth_identity_id
    ),
  })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: req.params.id, is_draft_order: false },
  })
  const row = data?.[0] as { id?: string; customer_id?: string | null } | undefined

  if (!row?.id || row.customer_id !== customerId) {
    orderNotFound()
  }

  const fields =
    (req.queryConfig?.fields as string[] | undefined) || STORE_ORDER_RETRIEVE_FIELDS

  const { result } = await getOrderDetailWorkflow(req.scope).run({
    input: {
      fields,
      order_id: req.params.id,
      filters: { is_draft_order: false },
    },
  })

  res.status(200).json({
    order: {
      ...(result as unknown as Record<string, unknown>),
      bank_transfer: await pendingBankTransferForOrder(req.scope, req.params.id),
    },
  })
}
