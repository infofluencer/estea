import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { buildEmailVerificationEmail } from "../emails/email-verification"
import { createNotificationIdempotent } from "../lib/notify"

const EXPIRES_HOURS = 24

type VerificationRequestedEvent = {
  entity_id: string
  entity_type: string
  code_provider: string
  auth_identity_id: string
  code: string
  expires_at?: string | Date
  metadata?: Record<string, unknown>
}

export default async function emailVerificationHandler({
  event: { data },
  container,
}: SubscriberArgs<VerificationRequestedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    if (data.entity_type !== "email") {
      return
    }

    const email = data.entity_id?.trim()
    const code = data.code?.trim()
    if (!email || !code) {
      logger.warn(
        "[email-verification] Missing entity_id or code — skipping notification."
      )
      return
    }

    const storefrontUrl =
      process.env.STOREFRONT_URL || "http://localhost:3015"
    const configModule = container.resolve("configModule")
    const urlPrefix =
      configModule.admin?.storefrontUrl || storefrontUrl

    const verifyUrl = `${urlPrefix}/verify-email?token=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`

    const { subject, html, text } = buildEmailVerificationEmail({
      email,
      verifyUrl,
      expiresHours: EXPIRES_HOURS,
    })

    const notificationService = container.resolve(Modules.NOTIFICATION)

    await createNotificationIdempotent(notificationService, {
      to: email,
      channel: "email",
      template: "email-verification",
      content: { subject, html, text },
      idempotency_key: `email-verification:${code.slice(0, 32)}`,
    })

    logger.info(`[email-verification] Verification email sent to ${email}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[email-verification] Failed to send verification email for ${data.entity_id}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.verification_requested",
}
