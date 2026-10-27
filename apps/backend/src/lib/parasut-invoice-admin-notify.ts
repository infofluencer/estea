/**
 * Fatura kesilemediğinde admin (CONTACT_INBOX) uyarısı.
 * Idempotent: metadata.admin_notified_at varsa tekrar gönderme.
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { formatOrderNumber } from "@escay/shared/order-number"
import type { ParasutOrderInvoiceMeta } from "../modules/parasut"
import { COMPANY } from "../emails/company"
import { emailLayout, escapeHtml, EMAIL_STYLES } from "../emails/format"
import { createNotificationIdempotent } from "./notify"

export async function notifyParasutInvoiceFailure(
  scope: MedusaContainer,
  orderId: string,
  invoiceMeta: ParasutOrderInvoiceMeta
): Promise<{ sent: boolean; skipped?: string }> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)

  if (invoiceMeta.status !== "error") {
    return { sent: false, skipped: "not_error" }
  }
  if (invoiceMeta.admin_notified_at) {
    return { sent: false, skipped: "already_notified" }
  }

  const to =
    process.env.PARASUT_ADMIN_ALERT_EMAIL?.trim() ||
    process.env.CONTACT_INBOX?.trim() ||
    COMPANY.emailOps

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

  const displayId =
    formatOrderNumber(order?.display_id) ||
    String(order?.display_id ?? orderId)

  const subject = `[Es Çay] Fatura kesilemedi — #${displayId}`
  const errText = invoiceMeta.error || "bilinmeyen hata"
  const html = emailLayout(`
    <h1 style="margin:0 0 12px;font-size:20px;color:${EMAIL_STYLES.brandColor};">Fatura kesilemedi</h1>
    <p style="margin:0 0 16px;color:${EMAIL_STYLES.mutedColor};">
      Sipariş <strong>#${escapeHtml(displayId)}</strong> için Parasut faturası hata durumunda.
      Yasal belge riski — admin panelinden yeniden deneyin veya logları kontrol edin.
    </p>
    <p style="margin:0 0 8px;"><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>
    <p style="margin:0 0 8px;"><strong>Müşteri:</strong> ${escapeHtml(order?.email || "—")}</p>
    <p style="margin:0 0 8px;"><strong>Hata:</strong> ${escapeHtml(errText)}</p>
    <p style="margin:0;font-size:13px;color:${EMAIL_STYLES.mutedColor};">
      Retry job otomatik yeniden deneyecek (max deneme). Manuel: Admin → Sipariş → Fatura widget → Yeniden kes.
    </p>
  `)
  const text = `Fatura kesilemedi — #${displayId}
Order: ${orderId}
Müşteri: ${order?.email || "—"}
Hata: ${errText}
`

  const notificationService = scope.resolve(Modules.NOTIFICATION)
  try {
    await createNotificationIdempotent(notificationService, {
      to,
      channel: "email",
      template: "parasut-invoice-failure-admin",
      content: { subject, html, text },
      resource_id: orderId,
      resource_type: "order",
      idempotency_key: `parasut-invoice-admin-fail:${orderId}:${invoiceMeta.at || "x"}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/idempotenc|duplicate|unique/i.test(message)) {
      return { sent: false, skipped: "idempotent" }
    }
    throw err
  }

  try {
    const orderModule = scope.resolve(Modules.ORDER)
    const existing = (order?.metadata?.parasut_invoice ||
      invoiceMeta) as ParasutOrderInvoiceMeta
    await orderModule.updateOrders([
      {
        id: orderId,
        metadata: {
          ...(order?.metadata || {}),
          parasut_invoice: {
            ...existing,
            admin_notified_at: new Date().toISOString(),
          },
        },
      },
    ])
  } catch (markErr) {
    logger.warn(
      `[parasut-invoice-admin] Mark notified failed order=${orderId}: ${String(markErr)}`
    )
  }

  logger.info(
    `[parasut-invoice-admin] Alert sent to ${to} order=${orderId}`
  )
  return { sent: true }
}
