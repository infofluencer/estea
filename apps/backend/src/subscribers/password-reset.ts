import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { buildPasswordResetEmail } from "../emails/password-reset"
import { createNotificationIdempotent, secretIdempotencyKey } from "../lib/notify"

type PasswordResetEvent = {
  entity_id: string
  token: string
  actor_type: string
}

export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const email = data.entity_id?.trim()
    if (!email) {
      logger.warn("[password-reset-email] Missing entity_id — skipping notification.")
      return
    }

    const storefrontUrl =
      process.env.STOREFRONT_URL || "http://localhost:3025"
    const configModule = container.resolve("configModule")

    let urlPrefix: string
    if (data.actor_type === "customer") {
      urlPrefix = configModule.admin?.storefrontUrl || storefrontUrl
    } else {
      const backendUrl =
        configModule.admin?.backendUrl && configModule.admin.backendUrl !== "/"
          ? configModule.admin.backendUrl
          : "http://localhost:9000"
      const adminPath = configModule.admin?.path ?? "/app"
      urlPrefix = `${backendUrl}${adminPath}`
    }

    const resetUrl = `${urlPrefix}/reset-password?token=${encodeURIComponent(data.token)}&email=${encodeURIComponent(email)}`

    const { subject, html, text } = buildPasswordResetEmail({
      email,
      resetUrl,
      expiresMinutes: 15,
    })

    const notificationService = container.resolve(Modules.NOTIFICATION)

    const result = await createNotificationIdempotent(notificationService, {
      to: email,
      channel: "email",
      template: "password-reset",
      content: { subject, html, text },
      idempotency_key: secretIdempotencyKey("password-reset", data.token),
    })

    if (result.sent) {
      logger.info(`[password-reset-email] Reset email sent to ${email}`)
    } else {
      logger.warn(
        `[password-reset-email] Reset email NOT sent to ${email} (${result.skipped}, key=${result.idempotency_key})`
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[password-reset-email] Failed to send reset email for ${data.entity_id}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
