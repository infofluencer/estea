import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  PaymentEvents,
} from "@medusajs/framework/utils"
import { findOrderIdForPayment } from "../lib/auto-fulfill-order"
import { issueSalesInvoiceForOrder } from "../lib/parasut-invoice"

type PaymentCapturedEvent = {
  id: string
}

/**
 * payment.captured → Parasut e-arşiv / e-fatura.
 * Kimlik yoksa mock fatura; hata metadata'ya yazılır (sessiz geçilmez).
 * Mevcut kargo / e-posta subscriber'larından bağımsız.
 */
export default async function paymentCapturedParasutHandler({
  event: { data },
  container,
}: SubscriberArgs<PaymentCapturedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const paymentId = data?.id

  if (!paymentId) {
    logger.warn("[payment-captured-parasut] Missing payment id — skip")
    return
  }

  try {
    const orderId = await findOrderIdForPayment(container, paymentId)
    if (!orderId) {
      logger.warn(
        `[payment-captured-parasut] Order not found for payment=${paymentId}`
      )
      return
    }

    const result = await issueSalesInvoiceForOrder(container, orderId)
    if (result.skipped) {
      logger.info(
        `[payment-captured-parasut] Skipped order=${orderId} status=${result.meta.status}`
      )
      return
    }
    if (!result.ok) {
      logger.error(
        `[payment-captured-parasut] Invoice failed order=${orderId}: ${result.meta.error || result.meta.status}`
      )
      return
    }
    logger.info(
      `[payment-captured-parasut] Invoice issued order=${orderId} no=${result.meta.invoice_number}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[payment-captured-parasut] Error payment=${paymentId}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
