import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { POST as corePOST } from "@medusajs/medusa/api/store/customers/route"

import {
  normalizeCustomerEmail,
  verifiedEmailForAuthIdentity,
} from "../../../lib/link-guest-orders"

/**
 * Override of core POST /store/customers.
 *
 * Core takes customer.email from the body without comparing it to the
 * registration token's login email. Email verification only proves the login
 * email, while guest-order linking, WP history/merge and password change look
 * customers up by email — so registering as attacker@x with body email victim@y
 * would hand the victim's data to the attacker. Require both to match.
 *
 * Core middlewares (authenticate allowUnregistered + body validation) still apply.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<{ email?: string }>,
  res: MedusaResponse
) => {
  const identityEmail = await verifiedEmailForAuthIdentity(
    req.scope,
    req.auth_context?.auth_identity_id
  )
  const bodyEmail = normalizeCustomerEmail(req.validatedBody?.email)

  if (!identityEmail || bodyEmail !== identityEmail) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Müşteri e-postası giriş e-postasıyla aynı olmalıdır."
    )
  }

  return corePOST(req as never, res)
}
