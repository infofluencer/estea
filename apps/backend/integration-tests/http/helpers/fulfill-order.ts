import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import type { MedusaContainer } from "@medusajs/framework/types"

export async function fulfillOrderItems(
  container: MedusaContainer,
  input: {
    orderId: string
    itemId: string
    quantity?: number
    locationId: string
    shippingOptionId?: string
  }
) {
  const { result } = await createOrderFulfillmentWorkflow(container).run({
    input: {
      order_id: input.orderId,
      items: [{ id: input.itemId, quantity: input.quantity ?? 1 }],
      location_id: input.locationId,
      ...(input.shippingOptionId
        ? { shipping_option_id: input.shippingOptionId }
        : {}),
      no_notification: true,
    },
  })
  return result
}

/** Fulfillment'ı kargoya verildi yapar (iade yalnız kargoya verilen adet için açılır). */
export async function shipOrderFulfillment(
  container: MedusaContainer,
  input: { orderId: string; fulfillmentId: string; itemId: string; quantity?: number }
) {
  await createOrderShipmentWorkflow(container).run({
    input: {
      order_id: input.orderId,
      fulfillment_id: input.fulfillmentId,
      items: [{ id: input.itemId, quantity: input.quantity ?? 1 }],
      no_notification: true,
    },
  })
}

/** Fulfillment'ı teslim edildi yapar (iade yalnız teslim edilen adet için açılır). */
export async function deliverOrderFulfillment(
  container: MedusaContainer,
  input: { orderId: string; fulfillmentId: string }
) {
  await markOrderFulfillmentAsDeliveredWorkflow(container).run({
    input: { orderId: input.orderId, fulfillmentId: input.fulfillmentId },
  })
}
