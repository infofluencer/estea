import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  PaymentEvents,
} from "@medusajs/framework/utils"

import { findOrderIdForPayment } from "../lib/auto-fulfill-order"
import {
  deterministicEventId,
  omnisendSkipReason,
  sendOmnisendEvent,
  storefrontBaseUrl,
  toOmnisendLineItems,
} from "../lib/omnisend"

type Address = {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
} | null

function toOmnisendAddress(a: Address) {
  if (!a) return undefined
  return {
    firstName: a.first_name || undefined,
    lastName: a.last_name || undefined,
    company: a.company || undefined,
    address1: a.address_1 || undefined,
    address2: a.address_2 || undefined,
    city: a.city || undefined,
    state: a.province || undefined,
    zip: a.postal_code || undefined,
    country: a.country_code?.toUpperCase() || undefined,
    phone: a.phone || undefined,
  }
}

/**
 * payment.captured → Omnisend "placed order".
 * order.placed değil: sipariş PayTR ödemesinden ÖNCE oluşuyor; ödenmeyen
 * siparişte Abandoned Checkout devam etmeli. Customer Reactivation da buna bağlı.
 */
export default async function omnisendPlacedOrderHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const paymentId = data?.id
  if (!paymentId) return

  try {
    const orderId = await findOrderIdForPayment(container, paymentId)
    if (!orderId) return

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "created_at",
        "total",
        "subtotal",
        "tax_total",
        "discount_total",
        "shipping_total",
        "metadata",
        "items.*",
        "shipping_address.*",
        "billing_address.*",
        "shipping_methods.name",
      ],
      filters: { id: orderId },
    })
    const order = orders?.[0] as Record<string, any> | undefined
    if (!order?.email) return
    if (omnisendSkipReason(order.email)) return

    await sendOmnisendEvent(logger, {
      eventName: "placed order",
      eventID: deterministicEventId(`placed-order:${order.id}`),
      email: order.email,
      properties: {
        orderID: order.id,
        orderNumber: String(order.display_id ?? order.id),
        createdAt: new Date(order.created_at).toISOString(),
        currency: String(order.currency_code || "try").toUpperCase(),
        totalPrice: Number(order.total ?? 0),
        subTotalPrice: Number(order.subtotal ?? 0),
        subTotalTaxIncluded: true,
        totalTax: Number(order.tax_total ?? 0),
        totalDiscount: Number(order.discount_total ?? 0),
        shippingPrice: Number(order.shipping_total ?? 0),
        shippingMethod: order.shipping_methods?.[0]?.name || undefined,
        paymentMethod: "card",
        paymentStatus: "paid",
        fulfillmentStatus: "unfulfilled",
        orderStatusURL: `${storefrontBaseUrl()}/order-tracking`,
        billingAddress: toOmnisendAddress(order.billing_address),
        shippingAddress: toOmnisendAddress(order.shipping_address),
        lineItems: toOmnisendLineItems(order.items),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`[omnisend-placed-order] payment=${paymentId}: ${message}`)
  }
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
