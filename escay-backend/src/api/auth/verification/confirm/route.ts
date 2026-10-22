import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { tryLinkGuestOrdersToRegisteredCustomer } from "../../../../lib/link-guest-orders"

type ConfirmBody = {
  code: string
  code_provider?: string
}

type AuthService = {
  confirmAuthVerification: (data: {
    auth_identity_id?: string
    code: string
    code_provider?: string
  }) => Promise<{
    entity_id: string
    entity_type: string
    code_provider: string
    verified_at?: Date | string | null
    auth_identity_id?: string
  }>
}

/**
 * Override of core POST /auth/verification/confirm.
 *
 * After a successful *email* verification, attach same-email guest orders to
 * the registered customer. Linking is skipped until this point so registering
 * with someone else's address cannot steal their guest orders.
 *
 * Core auth middlewares still apply (optional bearer + body validation).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { code, code_provider } = (req.validatedBody || req.body) as ConfirmBody
  const authService = req.scope.resolve(Modules.AUTH) as AuthService

  const result = await authService.confirmAuthVerification({
    auth_identity_id: req.auth_context?.auth_identity_id,
    code,
    code_provider,
  })

  if (result.entity_type === "email" && result.entity_id) {
    const authIdentityId =
      result.auth_identity_id || req.auth_context?.auth_identity_id
    await tryLinkGuestOrdersToRegisteredCustomer(req.scope, {
      email: result.entity_id,
      authIdentityId,
    })
  }

  res.status(200).json({
    entity_id: result.entity_id,
    entity_type: result.entity_type,
    code_provider: result.code_provider,
    verified_at: result.verified_at,
  })
}
