/**
 * Fatura sorunu / elle kesilecek iade faturası için admin (CONTACT_INBOX) uyarısı.
 * Satış faturası idempotent: metadata.admin_notified_at varsa tekrar gönderilmez.
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { formatOrderNumber } from "@escay/shared/order-number"
import type { BizimhesapOrderInvoiceMeta } from "../modules/bizimhesap"
import { COMPANY } from "../emails/company"
import { emailLayout, escapeHtml, EMAIL_STYLES } from "../emails/format"
import { createNotificationIdempotent } from "./notify"

function alertInbox(): string {
  return (
    process.env.BIZIMHESAP_ADMIN_ALERT_EMAIL?.trim() ||
    process.env.CONTACT_INBOX?.trim() ||
    COMPANY.emailOps
  )
}

async function readOrder(scope: MedusaContainer, orderId: string) {
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
    formatOrderNumber(order?.display_id) || String(order?.display_id ?? orderId)
  return { order, displayId }
}

export async function notifyBizimhesapInvoiceProblem(
  scope: MedusaContainer,
  orderId: string,
  invoiceMeta: BizimhesapOrderInvoiceMeta
): Promise<{ sent: boolean; skipped?: string }> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)

  if (invoiceMeta.status !== "error" && invoiceMeta.status !== "unknown") {
    return { sent: false, skipped: "not_a_problem" }
  }
  if (invoiceMeta.admin_notified_at) {
    return { sent: false, skipped: "already_notified" }
  }

  const to = alertInbox()
  const { order, displayId } = await readOrder(scope, orderId)
  const uncertain = invoiceMeta.status === "unknown"
  const heading = uncertain ? "Fatura durumu belirsiz" : "Fatura oluşturulamadı"
  const instruction = uncertain
    ? "BizimHesap yanıtı alınamadı; kayıt açılmış olabilir, otomatik tekrar denenmez. BizimHesap panelinde sipariş numarasını arayın. Kayıt yoksa: Admin → Sipariş → Fatura kutusu → Yeniden gönder."
    : "BizimHesap isteği reddetti, kayıt açılmadı. Otomatik tekrar denenecek; sonuç değişmezse hatayı giderip Admin → Sipariş → Fatura kutusundan yeniden gönderin."
  const errText = invoiceMeta.error || "bilinmeyen hata"
  const subject = `[Es Çay] ${heading} — #${displayId}`
  const html = emailLayout(`
    <h1 style="margin:0 0 12px;font-size:20px;color:${EMAIL_STYLES.brandColor};">${heading}</h1>
    <p style="margin:0 0 16px;color:${EMAIL_STYLES.mutedColor};">
      Sipariş <strong>#${escapeHtml(displayId)}</strong>: ${escapeHtml(instruction)}
    </p>
    <p style="margin:0 0 8px;"><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>
    <p style="margin:0 0 8px;"><strong>Müşteri:</strong> ${escapeHtml(order?.email || "—")}</p>
    <p style="margin:0;"><strong>Hata:</strong> ${escapeHtml(errText)}</p>
  `)
  const text = `${heading} — #${displayId}
${instruction}
Order: ${orderId}
Müşteri: ${order?.email || "—"}
Hata: ${errText}
`

  const notificationService = scope.resolve(Modules.NOTIFICATION)
  try {
    await createNotificationIdempotent(notificationService, {
      to,
      channel: "email",
      template: "bizimhesap-invoice-problem-admin",
      content: { subject, html, text },
      resource_id: orderId,
      resource_type: "order",
      idempotency_key: `bizimhesap-invoice-admin:${orderId}:${invoiceMeta.at || "x"}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/idempotenc|duplicate|unique/i.test(message)) {
      return { sent: false, skipped: "idempotent" }
    }
    throw err
  }

  try {
    const existing = (order?.metadata?.bizimhesap_invoice ||
      invoiceMeta) as BizimhesapOrderInvoiceMeta
    await scope.resolve(Modules.ORDER).updateOrders([
      {
        id: orderId,
        metadata: {
          ...(order?.metadata || {}),
          bizimhesap_invoice: {
            ...existing,
            admin_notified_at: new Date().toISOString(),
          },
        },
      },
    ])
  } catch (markErr) {
    logger.warn(
      `[bizimhesap-invoice-admin] Mark notified failed order=${orderId}: ${String(markErr)}`
    )
  }

  logger.info(`[bizimhesap-invoice-admin] Alert sent to ${to} order=${orderId}`)
  return { sent: true }
}

export async function notifyManualRefundInvoice(
  scope: MedusaContainer,
  input: { order_id: string; return_id: string; amount: number }
): Promise<void> {
  const { order, displayId } = await readOrder(scope, input.order_id)
  const amount = input.amount.toFixed(2)
  const subject = `[Es Çay] İade faturası elle kesilecek — #${displayId}`
  const instruction =
    "Para iadesi tamamlandı. BizimHesap API'si iade faturası açamıyor; iade faturasını BizimHesap panelinden kesin."
  const html = emailLayout(`
    <h1 style="margin:0 0 12px;font-size:20px;color:${EMAIL_STYLES.brandColor};">İade faturası elle kesilecek</h1>
    <p style="margin:0 0 16px;color:${EMAIL_STYLES.mutedColor};">
      Sipariş <strong>#${escapeHtml(displayId)}</strong>: ${escapeHtml(instruction)}
    </p>
    <p style="margin:0 0 8px;"><strong>Tutar:</strong> ${escapeHtml(amount)} TL</p>
    <p style="margin:0 0 8px;"><strong>Return ID:</strong> ${escapeHtml(input.return_id)}</p>
    <p style="margin:0;"><strong>Müşteri:</strong> ${escapeHtml(order?.email || "—")}</p>
  `)
  const text = `İade faturası elle kesilecek — #${displayId}
${instruction}
Tutar: ${amount} TL
Return: ${input.return_id}
Müşteri: ${order?.email || "—"}
`

  await createNotificationIdempotent(scope.resolve(Modules.NOTIFICATION), {
    to: alertInbox(),
    channel: "email",
    template: "bizimhesap-refund-manual-admin",
    content: { subject, html, text },
    resource_id: input.order_id,
    resource_type: "order",
    idempotency_key: `bizimhesap-refund-manual:${input.return_id}`,
  })
}
