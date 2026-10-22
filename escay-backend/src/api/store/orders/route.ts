import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows"
import {
  tryLinkGuestOrdersToRegisteredCustomer,
  verifiedEmailForAuthIdentity,
} from "../../../lib/link-guest-orders"

/**
 * Override of core GET /store/orders.
 *
 * Actor JWT is only issued after email verification (authVerificationsPerActor).
 * Before listing, re-point same-email guest orders onto this customer so
 * "siparişlerim" includes pre-registration checkouts. Idempotent; confirm-route
 * linking is the primary path — this is the backstop (already-verified
 * accounts, admin-created customers, missed confirm hook).
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

  const variables = {
    filters: {
      ...req.filterableFields,
      is_draft_order: false,
      customer_id: customerId,
    },
    ...req.queryConfig.pagination,
  }

  const { result } = await getOrdersListWorkflow(req.scope).run({
    input: {
      fields: req.queryConfig.fields,
      variables,
    },
  })

  if (Array.isArray(result)) {
    res.json({
      orders: result,
      count: result.length,
      offset: req.queryConfig.pagination.skip,
      limit: req.queryConfig.pagination.take,
    })
    return
  }

  res.json({
    orders: result.rows,
    count: result.metadata.count,
    offset: result.metadata.skip,
    limit: result.metadata.take,
  })
}
