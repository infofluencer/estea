import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { buildReturnRefundedCustomerEmail } from "../emails/return-notifications"
import { loadReturnEmailContext } from "../lib/return-email-context"
import { createNotificationIdempotent } from "../lib/notify"

export type ReturnRefundedEvent = {
  return_id: string
  order_id: string
  amount: number
  shipping_included?: boolean
  payment_id?: string
}

/**
 * escay.return_refunded → müşteriye iade onay / tutar maili.
 * processReturnRefund success sonrası emit edilir (metadata yazıldıktan sonra).
 */
export default async function returnRefundedEmailHandler({
  event: { data },
  container,
}: SubscriberArgs<ReturnRefundedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!data?.return_id) {
    logger.warn("[return-refunded-email] Missing return_id — skip")
    return
  }

  try {
    const ctx = await loadReturnEmailContext(container, data.return_id)
    if (!ctx?.email) {
      logger.warn(
        `[return-refunded-email] No customer email — return=${data.return_id}`
      )
      return
    }

    const mail = buildReturnRefundedCustomerEmail({
      returnId: ctx.returnId,
      orderDisplayId: ctx.orderDisplayId,
      email: ctx.email,
      amount: data.amount,
      currencyCode: ctx.currencyCode,
      shippingIncluded: Boolean(data.shipping_included),
      notAccepted: ctx.notAccepted,
      notAcceptedReason: ctx.notAcceptedReason,
    })

    const notificationService = container.resolve(Modules.NOTIFICATION)
    await createNotificationIdempotent(notificationService, {
      to: ctx.email,
      channel: "email",
      template: "return-refunded-customer",
      content: {
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      },
      resource_id: ctx.returnId,
      resource_type: "return",
      idempotency_key: `return-refunded-customer:${ctx.returnId}:${data.payment_id || data.amount}`,
    })

    logger.info(
      `[return-refunded-email] Sent — return=${ctx.returnId} to=${ctx.email} amount=${data.amount}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[return-refunded-email] Failed for return=${data.return_id}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "escay.return_refunded",
}
