import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  PaymentEvents,
} from "@medusajs/framework/utils"
import { findOrderIdForPayment } from "../lib/auto-fulfill-order"
import { issueSalesInvoiceForOrder } from "../lib/bizimhesap-invoice"

type PaymentCapturedEvent = {
  id: string
}

/**
 * payment.captured → BizimHesap satış faturası.
 * firmId yoksa mock; hata metadata'ya yazılır (sessiz geçilmez).
 * Mevcut kargo / e-posta subscriber'larından bağımsız.
 */
export default async function paymentCapturedBizimhesapHandler({
  event: { data },
  container,
}: SubscriberArgs<PaymentCapturedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const paymentId = data?.id

  if (!paymentId) {
    logger.warn("[payment-captured-bizimhesap] Missing payment id — skip")
    return
  }

  try {
    const orderId = await findOrderIdForPayment(container, paymentId)
    if (!orderId) {
      logger.warn(
        `[payment-captured-bizimhesap] Order not found for payment=${paymentId}`
      )
      return
    }

    const result = await issueSalesInvoiceForOrder(container, orderId)
    if (result.skipped) {
      logger.info(
        `[payment-captured-bizimhesap] Skipped order=${orderId} status=${result.meta.status}`
      )
      return
    }
    if (!result.ok) {
      logger.error(
        `[payment-captured-bizimhesap] Invoice failed order=${orderId}: ${result.meta.error || result.meta.status}`
      )
      return
    }
    logger.info(
      `[payment-captured-bizimhesap] order=${orderId} status=${result.meta.status} guid=${result.meta.guid || "-"}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[payment-captured-bizimhesap] Error payment=${paymentId}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
