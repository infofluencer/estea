import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"
import { formatOrderNumber } from "@escay/shared/order-number"
import { STORE_ORDER_RETRIEVE_FIELDS } from "../api/store/orders/_shared"
import { buildOrderConfirmationEmail } from "../emails/order-confirmation"
import { coerceAmount } from "../emails/format"
import type { BankTransferInfo } from "./bank-transfer"
import { createNotificationIdempotent } from "./notify"

/**
 * Send "Siparişiniz Alındı" after payment capture (not on order.placed).
 * Idempotent via notification idempotency_key `order-confirmation:{orderId}`.
 *
 * `bankTransfer` verilirse (havale siparişi, order.placed): IBAN'lı
 * "Ödemeniz Bekleniyor" maili, ayrı key `order-bank-transfer:{orderId}`.
 */
export async function sendOrderConfirmationEmail(
  container: MedusaContainer,
  orderId: string,
  opts: { bankTransfer?: BankTransferInfo | null } = {}
): Promise<{ sent: boolean; skipped?: string }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const { result: order } = await getOrderDetailWorkflow(container).run({
    input: {
      fields: STORE_ORDER_RETRIEVE_FIELDS,
      order_id: orderId,
      filters: { is_draft_order: false },
    },
  })

  if ((order as { status?: string }).status === "canceled") {
    logger.info(
      `[order-confirmation-email] Skip canceled order=${orderId}`
    )
    return { sent: false, skipped: "canceled" }
  }

  const email = order.email?.trim()
  if (!email) {
    logger.warn(
      `[order-confirmation-email] Order ${orderId} has no email — skip`
    )
    return { sent: false, skipped: "no_email" }
  }

  const displayId =
    formatOrderNumber(order.display_id) ||
    String(order.custom_display_id ?? order.display_id ?? order.id)

  const storefrontUrl = (
    process.env.STOREFRONT_URL || "http://localhost:3015"
  ).replace(/\/$/, "")
  const trackingUrl = `${storefrontUrl}/order-tracking/${encodeURIComponent(order.id)}?email=${encodeURIComponent(email)}`
  const trackingFormUrl = `${storefrontUrl}/order-tracking`

  const orderAny = order as {
    original_item_total?: number | string | null
    discount_total?: number | string | null
    item_subtotal?: number | string | null
    metadata?: Record<string, unknown> | null
  }
  const discountForDisplay = Number(coerceAmount(orderAny.discount_total) ?? 0)
  const itemTotalForDisplay =
    orderAny.original_item_total ??
    (discountForDisplay > 0 && order.item_total != null
      ? Number(coerceAmount(order.item_total) ?? 0) + discountForDisplay
      : (orderAny.item_subtotal ?? order.item_total))

  const parasutInv = orderAny.metadata?.parasut_invoice as
    | { pdf_url?: string; status?: string }
    | undefined
  const invoicePdfUrl =
    parasutInv?.status === "issued" && parasutInv.pdf_url
      ? parasutInv.pdf_url
      : null

  const { subject, html, text } = buildOrderConfirmationEmail({
    displayId,
    email,
    trackingUrl,
    trackingFormUrl,
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
          ? {
              title: row.variant.title,
              options: row.variant.options,
            }
          : null,
      }
    }),
    itemTotal: coerceAmount(itemTotalForDisplay),
    discountTotal: coerceAmount(orderAny.discount_total),
    shippingTotal: coerceAmount(order.shipping_total),
    taxTotal: coerceAmount(order.tax_total),
    total: coerceAmount(order.total),
    shippingAddress: order.shipping_address,
    invoicePdfUrl,
    bankTransfer: opts.bankTransfer ?? null,
    paidByBankTransfer: !opts.bankTransfer && orderAny.metadata?.payment_method === "bank_transfer",
  })

  const notificationService = container.resolve(Modules.NOTIFICATION)

  await createNotificationIdempotent(notificationService, {
    to: email,
    channel: "email",
    template: opts.bankTransfer ? "order-bank-transfer" : "order-confirmation",
    content: { subject, html, text },
    resource_id: order.id,
    resource_type: "order",
    idempotency_key: opts.bankTransfer
      ? `order-bank-transfer:${order.id}`
      : `order-confirmation:${order.id}`,
  })

  logger.info(
    `[order-confirmation-email] Sent to ${email} for order #${displayId}`
  )
  return { sent: true }
}
