import { requestVerificationWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules, NotificationStatus } from "@medusajs/framework/utils"
import {
  VERIFICATION_AUTO_HEADER,
  decideVerificationRequest,
} from "../../../../lib/verification-link"
import { refundVerificationRequestHit } from "../rate-limit"

type RequestBody = {
  entity_id: string
  entity_type: string
  code_provider: string
  metadata?: Record<string, unknown>
}

type VerificationRow = {
  entity_id: string
  entity_type: string
  code_provider: string
  requested_at?: Date | string | null
  verified_at?: Date | string | null
}

type AuthService = {
  listAuthVerifications: (filters: Record<string, unknown>) => Promise<VerificationRow[]>
}

type NotificationService = {
  listNotifications: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<{ id: string }[]>
}

/** Son bağlantının maili gönderildi/gönderiliyor mu; kayıt yoksa yeni bağlantı üretilmeli. */
async function hasMailOnRecord(
  req: AuthenticatedMedusaRequest,
  email: string,
  requestedAt: Date | string
): Promise<boolean> {
  try {
    const notifications = req.scope.resolve(Modules.NOTIFICATION) as unknown as NotificationService
    const rows = await notifications.listNotifications(
      {
        to: email.trim(),
        template: "email-verification",
        status: [NotificationStatus.SUCCESS, NotificationStatus.PENDING],
        created_at: { $gte: new Date(requestedAt) },
      },
      { select: ["id"], take: 1 }
    )
    return rows.length > 0
  } catch {
    return false
  }
}

/**
 * Override of core POST /auth/verification/request (bkz. lib/verification-link.ts):
 * elde geçerli bağlantı varsa token yenilenmez, 200 + already_sent döner.
 * Yeni bağlantı gerekiyorsa core workflow aynen çalışır (201).
 * Core auth middleware'leri geçerli (bearer + body doğrulama).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { entity_id, entity_type, code_provider, metadata } = (req.validatedBody ||
    req.body) as RequestBody
  const auth_identity_id = req.auth_context.auth_identity_id
  const authService = req.scope.resolve(Modules.AUTH) as unknown as AuthService

  const [verification] = await authService.listAuthVerifications({
    auth_identity_id,
    entity_id,
    entity_type,
  })

  const mailOnRecord =
    !!verification?.requested_at &&
    !verification.verified_at &&
    (await hasMailOnRecord(req, entity_id, verification.requested_at))

  const decision = decideVerificationRequest({
    verification,
    auto: req.headers[VERIFICATION_AUTO_HEADER] === "1",
    mailOnRecord,
    now: new Date(),
  })

  if (decision.action === "keep") {
    refundVerificationRequestHit(res)
    return res.status(200).json({
      verification: {
        entity_id: verification.entity_id,
        entity_type: verification.entity_type,
        code_provider: verification.code_provider,
        requested_at: verification.requested_at,
        verified_at: verification.verified_at,
      },
      already_sent: true,
      reason: decision.reason,
      retry_after_seconds: Math.ceil(decision.retryAfterMs / 1000),
    })
  }

  const { result } = await requestVerificationWorkflow(req.scope).run({
    input: { auth_identity_id, entity_id, entity_type, code_provider, metadata },
  })
  return res.status(201).json({ verification: result })
}
