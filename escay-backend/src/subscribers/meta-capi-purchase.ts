import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  PaymentEvents,
} from "@medusajs/framework/utils"

import { findOrderIdForPayment } from "../lib/auto-fulfill-order"
import { metaCapiSkipReason, sendMetaPurchase } from "../lib/meta-capi"

/** payment.captured → Meta Conversions API Purchase (ödeme alındıktan sonra, tek sefer). */
export default async function metaCapiPurchaseHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const paymentId = data?.id
  if (!paymentId || !(process.env.META_CAPI_TOKEN || "").trim()) return

  try {
    const orderId = await findOrderIdForPayment(container, paymentId)
    if (!orderId) return
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "email",
        "total",
        "created_at",
        "metadata",
        "shipping_address.*",
        "items.variant_id",
        "items.quantity",
        // Sipariş kalemi adedi order_item'da (detail) durur; yalnız "items.quantity"
        // istenirse Medusa adedi boş döner ve toplamlar 0 hesaplanır.
        "items.detail.quantity",
        // order.total (Purchase value) bu alanlarla hesaplanır; eksikse 0/negatif çıkar.
        "items.unit_price",
        "items.is_tax_inclusive",
        "items.tax_lines.rate",
        "items.adjustments.amount",
        "shipping_methods.amount",
        "shipping_methods.is_tax_inclusive",
        "items.variant.sku",
      ],
      filters: { id: orderId },
    })
    const order = orders?.[0] as Parameters<typeof sendMetaPurchase>[1] | undefined
    if (!order || metaCapiSkipReason(order)) return
    await sendMetaPurchase(logger, order)
  } catch (err) {
    logger.warn(
      `[meta-capi-purchase] payment=${paymentId}: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
