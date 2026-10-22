import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { buildReturnRejectedCustomerEmail } from "../emails/return-notifications"
import { loadReturnEmailContext } from "../lib/return-email-context"
import { createNotificationIdempotent } from "../lib/notify"

export type ReturnRejectedEvent = {
  return_id: string
  order_id: string
  reason?: string | null
  rejected_by?: string | null
  canceled?: boolean
}

/**
 * escay.return_rejected → müşteriye iade reddi maili.
 */
export default async function returnRejectedEmailHandler({
  event: { data },
  container,
}: SubscriberArgs<ReturnRejectedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!data?.return_id) {
    logger.warn("[return-rejected-email] Missing return_id — skip")
    return
  }

  try {
    const ctx = await loadReturnEmailContext(container, data.return_id)
    if (!ctx?.email) {
      logger.warn(
        `[return-rejected-email] No customer email — return=${data.return_id}`
      )
      return
    }

    const mail = buildReturnRejectedCustomerEmail({
      returnId: ctx.returnId,
      orderDisplayId: ctx.orderDisplayId,
      email: ctx.email,
      reason: data.reason ?? null,
      items: ctx.items,
    })

    const notificationService = container.resolve(Modules.NOTIFICATION)
    await createNotificationIdempotent(notificationService, {
      to: ctx.email,
      channel: "email",
      template: "return-rejected-customer",
      content: {
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      },
      resource_id: ctx.returnId,
      resource_type: "return",
      idempotency_key: `return-rejected-customer:${ctx.returnId}`,
    })

    logger.info(
      `[return-rejected-email] Sent — return=${ctx.returnId} to=${ctx.email}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[return-rejected-email] Failed for return=${data.return_id}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "escay.return_rejected",
}
