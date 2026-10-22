/**
 * Fatura kesildikten sonra müşteriye PDF linki.
 * Idempotent: notification idempotency_key + metadata.customer_emailed_at.
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { formatOrderNumber } from "@escay/shared/order-number"
import type { ParasutOrderInvoiceMeta } from "../modules/parasut"
import { buildInvoiceIssuedEmail } from "../emails/invoice-issued"
import { COMPANY } from "../emails/company"
import { createNotificationIdempotent } from "./notify"

export async function sendInvoiceIssuedEmail(
  scope: MedusaContainer,
  orderId: string,
  invoiceMeta: ParasutOrderInvoiceMeta
): Promise<{ sent: boolean; skipped?: string }> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)

  if (invoiceMeta.status !== "issued") {
    return { sent: false, skipped: "not_issued" }
  }
  if (invoiceMeta.customer_emailed_at) {
    return { sent: false, skipped: "already_marked" }
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "email", "display_id", "metadata"],
    filters: { id: orderId },
  })
  const order = orders?.[0] as
    | {
        id: string
        email?: string | null
        display_id?: number | string | null
        metadata?: Record<string, unknown> | null
      }
    | undefined

  if (!order?.id) {
    return { sent: false, skipped: "no_order" }
  }

  const email = order.email?.trim()
  if (!email) {
    logger.warn(`[parasut-invoice-email] No email order=${orderId}`)
    return { sent: false, skipped: "no_email" }
  }

  const displayId =
    formatOrderNumber(order.display_id) ||
    String(order.display_id ?? order.id)

  const { subject, html, text } = buildInvoiceIssuedEmail({
    displayId,
    invoiceNumber: invoiceMeta.invoice_number || "—",
    invoiceType: invoiceMeta.invoice_type || "e_archive",
    pdfUrl: invoiceMeta.pdf_url || null,
    supportEmail: COMPANY.emailOps,
  })

  const notificationService = scope.resolve(Modules.NOTIFICATION)
  try {
    await createNotificationIdempotent(notificationService, {
      to: email,
      channel: "email",
      template: "parasut-invoice-issued",
      content: { subject, html, text },
      resource_id: order.id,
      resource_type: "order",
      idempotency_key: `parasut-invoice:${order.id}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/idempotenc|duplicate|unique/i.test(message)) {
      logger.info(
        `[parasut-invoice-email] Already sent (idempotent) order=${orderId}`
      )
      return { sent: false, skipped: "idempotent" }
    }
    throw err
  }

  // Mark emailed on metadata (best-effort)
  try {
    const existing = (order.metadata?.parasut_invoice ||
      invoiceMeta) as ParasutOrderInvoiceMeta
    const orderModule = scope.resolve(Modules.ORDER)
    await orderModule.updateOrders([
      {
        id: orderId,
        metadata: {
          ...(order.metadata || {}),
          parasut_invoice: {
            ...existing,
            customer_emailed_at: new Date().toISOString(),
          },
        },
      },
    ])
  } catch (markErr) {
    logger.warn(
      `[parasut-invoice-email] Mark emailed failed order=${orderId}: ${String(markErr)}`
    )
  }

  logger.info(
    `[parasut-invoice-email] Sent to ${email} order=${orderId} no=${invoiceMeta.invoice_number}`
  )
  return { sent: true }
}
