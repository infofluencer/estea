import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, PaymentEvents } from "@medusajs/framework/utils"
import { autoFulfillPaidOrder, findOrderIdForPayment } from "../lib/auto-fulfill-order"
import { errorText, recordOpsEvent } from "../lib/ops-events"

type PaymentCapturedEvent = { id: string }

/**
 * Ödeme capture (PayTR callback / havale onayı) → otomatik kargo kaydı.
 * Adaptör yoksa ve SHIPPING_AUTO_FULFILL açık değilse no-op (ödemeyi bozmaz).
 */
export default async function paymentCapturedFulfillmentHandler({
  event: { data },
  container,
}: SubscriberArgs<PaymentCapturedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const paymentId = data?.id
  if (!paymentId) {
    logger.warn("[payment-captured-fulfillment] Missing payment id — skip")
    return
  }

  let orderId: string | null = null
  try {
    orderId = await findOrderIdForPayment(container, paymentId)
    if (!orderId) {
      logger.warn(`[payment-captured-fulfillment] Order not found for payment=${paymentId}`)
      return
    }
    const result = await autoFulfillPaidOrder(container, orderId)
    if (!result.ok) {
      logger.error(`[payment-captured-fulfillment] Failed order=${orderId}: ${result.message}`)
      await recordOpsEvent(container, {
        kind: "shipment.failed",
        level: "error",
        title: "Ödeme alındı ama kargo gönderisi açılamadı",
        detail: `${result.message}\n\nAdmin → sipariş → "Kargo" kutusundan yeniden deneyin.`,
        orderId,
      })
      return
    }
    if (result.skipped) {
      logger.info(`[payment-captured-fulfillment] Skipped order=${orderId}: ${result.skipped}`)
      return
    }
    logger.info(`[payment-captured-fulfillment] Fulfillment created order=${orderId} ful=${result.fulfillmentId}`)
    await recordOpsEvent(container, {
      kind: "shipment.created",
      level: "info",
      title: "Kargo gönderisi otomatik açıldı",
      orderId,
      data: { fulfillment_id: result.fulfillmentId },
    })
  } catch (error) {
    const message = errorText(error)
    logger.error(`[payment-captured-fulfillment] Error payment=${paymentId}: ${message}`)
    await recordOpsEvent(container, {
      kind: "shipment.failed",
      level: "error",
      title: "Ödeme alındı ama kargo gönderisi açılamadı",
      detail: `${message}\n\nAdmin → sipariş → "Kargo" kutusundan yeniden deneyin.`,
      orderId,
      data: { payment_id: paymentId },
    })
  }
}

export const config: SubscriberConfig = { event: PaymentEvents.CAPTURED }
