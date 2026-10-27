/**
 * Trigger order confirmation email for an existing order (subscriber path).
 *
 * Usage: medusa exec ./src/scripts/test-order-email.ts -- order_01M06D69DJ463JC9C45H2P35PA
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"
import { STORE_ORDER_RETRIEVE_FIELDS } from "../api/store/orders/_shared"
import { buildOrderConfirmationEmail } from "../emails/order-confirmation"
import { coerceAmount } from "../emails/format"

export default async function testOrderEmail({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderId = args?.[0]
  if (!orderId) throw new Error("Kullanım: medusa exec ./src/scripts/test-order-email.ts <order_id>")

  const { result: order } = await getOrderDetailWorkflow(container).run({
    input: {
      fields: STORE_ORDER_RETRIEVE_FIELDS,
      order_id: orderId,
      filters: { is_draft_order: false },
    },
  })

  const email = order.email?.trim()
  if (!email) {
    throw new Error(`Order ${orderId} has no email`)
  }

  const displayId = String(order.custom_display_id ?? order.display_id ?? order.id)
  const storefrontUrl = (
    process.env.STOREFRONT_URL || "http://localhost:3025"
  ).replace(/\/$/, "")
  const content = buildOrderConfirmationEmail({
    displayId,
    email,
    trackingUrl: `${storefrontUrl}/order-tracking/${encodeURIComponent(order.id)}?email=${encodeURIComponent(email)}`,
    trackingFormUrl: `${storefrontUrl}/order-tracking`,
    currencyCode: order.currency_code ?? "TRY",
    items: (order.items ?? []).map((item) => {
      const row = item as typeof item & {
        variant?: {
          title?: string | null
          options?: { value?: string | null }[] | null
        } | null
      }
      return {
        title: row.title ?? row.product_title,
        quantity: row.quantity,
        unit_price: coerceAmount(row.unit_price),
        variant_title: row.variant_title,
        variant: row.variant
          ? { title: row.variant.title, options: row.variant.options }
          : null,
      }
    }),
    itemTotal: coerceAmount(order.item_total),
    shippingTotal: coerceAmount(order.shipping_total),
    taxTotal: coerceAmount(order.tax_total),
    total: coerceAmount(order.total),
    shippingAddress: order.shipping_address,
  })

  const notificationService = container.resolve(Modules.NOTIFICATION)
  await notificationService.createNotifications({
    to: email,
    channel: "email",
    template: "order-confirmation",
    content,
    resource_id: order.id,
    resource_type: "order",
    idempotency_key: `order-confirmation-test:${order.id}:${Date.now()}`,
  })

  logger.info(
    `[test-order-email] Sent order confirmation for #${displayId} to ${email}`
  )
}
