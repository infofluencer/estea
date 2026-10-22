import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  FulfillmentWorkflowEvents,
} from "@medusajs/framework/utils"
import { sendShippingStatusEmail } from "../lib/shipping-status-email"

type ShippingStatusEvent = {
  id: string
  no_notification?: boolean
}

/**
 * shipment.created / delivery.created → müşteri kargo durumu maili.
 * Payload.id = fulfillment id (Medusa emit).
 */
export default async function orderShippingStatusEmailHandler({
  event,
  container,
}: SubscriberArgs<ShippingStatusEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillmentId = event?.data?.id
  const eventName = event?.name

  if (!fulfillmentId) {
    logger.warn(`[order-shipping-email] Missing fulfillment id — skip (${eventName})`)
    return
  }
  if (event.data?.no_notification) {
    logger.info(
      `[order-shipping-email] no_notification — skip ful=${fulfillmentId} event=${eventName}`
    )
    return
  }

  const kind =
    eventName === FulfillmentWorkflowEvents.DELIVERY_CREATED
      ? "delivered"
      : eventName === FulfillmentWorkflowEvents.SHIPMENT_CREATED
        ? "shipped"
        : null

  if (!kind) {
    logger.warn(`[order-shipping-email] Unknown event=${eventName} — skip`)
    return
  }

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: links } = await query.graph({
      entity: "order_fulfillment",
      fields: ["order_id", "fulfillment_id"],
      filters: { fulfillment_id: fulfillmentId },
    })
    const orderId = (links?.[0] as { order_id?: string } | undefined)?.order_id
    if (!orderId) {
      logger.warn(
        `[order-shipping-email] No order linked to ful=${fulfillmentId}`
      )
      return
    }

    await sendShippingStatusEmail(container, {
      orderId,
      fulfillmentId,
      kind,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[order-shipping-email] Failed ful=${fulfillmentId} kind=${kind}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: [
    FulfillmentWorkflowEvents.SHIPMENT_CREATED,
    FulfillmentWorkflowEvents.DELIVERY_CREATED,
  ],
  context: {
    subscriberId: "order-shipping-status-email",
  },
}
