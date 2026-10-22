import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  PaymentEvents,
} from "@medusajs/framework/utils"
import { findOrderIdForPayment } from "../lib/auto-fulfill-order"
import { sendOrderConfirmationEmail } from "../lib/order-confirmation-email"

type PaymentCapturedEvent = {
  id: string
}

/**
 * payment.captured → "Siparişiniz Alındı" (ödeme sonrası, tek sefer).
 * order.placed'da mail YOK — unpaid/fail spam engellenir.
 */
export default async function paymentCapturedEmailHandler({
  event: { data },
  container,
}: SubscriberArgs<PaymentCapturedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const paymentId = data?.id

  if (!paymentId) {
    logger.warn("[payment-captured-email] Missing payment id — skip")
    return
  }

  try {
    const orderId = await findOrderIdForPayment(container, paymentId)
    if (!orderId) {
      logger.warn(
        `[payment-captured-email] Order not found for payment=${paymentId}`
      )
      return
    }

    const result = await sendOrderConfirmationEmail(container, orderId)
    if (result.skipped) {
      logger.info(
        `[payment-captured-email] Skipped order=${orderId}: ${result.skipped}`
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Duplicate idempotency_key → treat as already sent
    if (/idempotenc|duplicate|unique/i.test(message)) {
      logger.info(
        `[payment-captured-email] Already sent (idempotent) payment=${paymentId}: ${message}`
      )
      return
    }
    logger.error(
      `[payment-captured-email] Failed payment=${paymentId}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
