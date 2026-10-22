import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"

import { verifiedEmailForAuthIdentity } from "../../../../../lib/link-guest-orders"

type ChangePasswordBody = {
  current_password: string
  new_password: string
}

const MIN_PASSWORD_LENGTH = 8

/**
 * Logged-in password change.
 *
 * Core POST /auth/:actor/:provider/update only accepts reset-password JWTs
 * (purpose=reset). Session bearers are rejected — so account settings need
 * this authenticated store route: verify current password, then update.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<ChangePasswordBody>,
  res: MedusaResponse
) => {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Unauthorized")
  }

  const currentPassword = req.validatedBody?.current_password
  const newPassword = req.validatedBody?.new_password

  if (!currentPassword || typeof currentPassword !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Mevcut şifre gerekli."
    )
  }
  if (!newPassword || typeof newPassword !== "string") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Yeni şifre gerekli.")
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`
    )
  }
  if (currentPassword === newPassword) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Yeni şifre mevcut şifreden farklı olmalıdır."
    )
  }

  // Verify and update the caller's own login identity — never customer.email,
  // which is client-chosen at signup and may name another identity.
  const email = await verifiedEmailForAuthIdentity(
    req.scope,
    req.auth_context?.auth_identity_id
  )
  if (!email) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Hesap e-postası bulunamadı."
    )
  }

  const authModule = req.scope.resolve(Modules.AUTH)
  const authResult = await authModule.authenticate("emailpass", {
    body: { email, password: currentPassword },
  })

  if (!authResult.success) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Mevcut şifre hatalı."
    )
  }

  const updateResult = await authModule.updateProvider("emailpass", {
    entity_id: email,
    password: newPassword,
  })

  if (!updateResult.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      updateResult.error || "Şifre güncellenemedi."
    )
  }

  res.status(200).json({ success: true })
}
