import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { COMPANY } from "../emails/company"
import { recordOpsEvent } from "../lib/ops-events"
import {
  buildReturnCodeCustomerEmail,
  buildReturnRequestedCustomerEmail,
  buildReturnRequestedSellerEmail,
} from "../emails/return-notifications"
import { markReturnCodeSent } from "../lib/return-code"
import { loadReturnEmailContext } from "../lib/return-email-context"
import { createNotificationIdempotent } from "../lib/notify"
import { getConfiguredCarrier } from "../modules/carrier/registry"
import { isReturnRejected } from "../lib/return-rejection"

type ReturnRequestedEvent = { order_id: string; return_id: string }

/**
 * order.return_requested → (adaptör createReturn sunuyorsa iade kodu) + müşteri/satıcı mailleri.
 *
 * Tetik anı: confirmReturnRequestWorkflow tamamlandı. Ürün henüz gelmedi;
 * refund YOK (order.return_received ayrı). Adaptör yoksa müşteriye "kod ayrıca
 * gelecek" maili gider; admin kodu İade kutusundan elle gönderir.
 */
export default async function returnRequestedEmailHandler({
  event: { data },
  container,
}: SubscriberArgs<ReturnRequestedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (!data?.return_id) {
    logger.warn("[return-requested-email] Missing return_id — skip")
    return
  }

  try {
    const ctx = await loadReturnEmailContext(container, data.return_id)
    if (!ctx) {
      logger.warn(`[return-requested-email] Context missing — return=${data.return_id}`)
      return
    }

    // 1) Otomatik iade kodu (yalnız adaptör createReturn sunuyorsa)
    let returnCode: string | null = null
    let tracking: { trackingNumber: string | null; trackingUrl: string | null; labelUrl: string | null; carrierCode: string | null } = {
      trackingNumber: null,
      trackingUrl: null,
      labelUrl: null,
      carrierCode: null,
    }
    const adapter = getConfiguredCarrier()
    if (adapter?.createReturn) {
      try {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: rows } = await query.graph({
          entity: "return",
          fields: ["id", "metadata", "order.fulfillments.canceled_at", "order.fulfillments.data"],
          filters: { id: data.return_id },
        })
        const ret = rows?.[0] as
          | { metadata?: Record<string, unknown> | null; order?: { fulfillments?: { canceled_at?: unknown; data?: Record<string, unknown> | null }[] } }
          | undefined
        const original = (ret?.order?.fulfillments || []).find((f) => !f.canceled_at && adapter.owns(f.data))
        if (original && !isReturnRejected(ret?.metadata)) {
          const res = await adapter.createReturn(original.data || {}, data.return_id)
          returnCode = res.returnCode || res.trackingNumber || null
          tracking = {
            trackingNumber: returnCode,
            trackingUrl: res.trackingUrl ?? null,
            labelUrl: res.labelUrl ?? null,
            carrierCode: adapter.name,
          }
        }
      } catch (err) {
        logger.error(`[return-requested-email] ${adapter.code} iade kaydı açılamadı return=${data.return_id}: ${String(err)}`)
      }
    }

    const sourceLabel = ctx.source === "guest" ? "misafir" : ctx.source === "customer" ? "üye" : "panelden"
    await recordOpsEvent(container, {
      kind: "return.requested",
      level: "info",
      title: `İade talebi alındı (${sourceLabel})`,
      detail: returnCode
        ? `İade kodu (${tracking.carrierCode}): ${returnCode}`
        : "Kargo firmasından kodlu iade açılıp kod müşteriye gönderilmeli (sipariş sayfası → İade → Kodu müşteriye gönder).",
      orderId: ctx.orderId,
      data: { return_id: ctx.returnId },
    })

    const notificationService = container.resolve(Modules.NOTIFICATION)
    const sellerTo = process.env.RETURNS_INBOX || process.env.CONTACT_INBOX || COMPANY.emailOps

    if (ctx.email) {
      const customerMail = returnCode
        ? buildReturnCodeCustomerEmail({ orderDisplayId: ctx.orderDisplayId, code: returnCode, items: ctx.items })
        : buildReturnRequestedCustomerEmail({
            returnId: ctx.returnId,
            orderDisplayId: ctx.orderDisplayId,
            email: ctx.email,
            items: ctx.items,
            customerNote: ctx.customerNote,
          })
      await createNotificationIdempotent(notificationService, {
        to: ctx.email,
        channel: "email",
        template: returnCode ? "return-code-customer" : "return-requested-customer",
        content: { subject: customerMail.subject, html: customerMail.html, text: customerMail.text },
        resource_id: ctx.returnId,
        resource_type: "return",
        // Tek mail / iade — kodlu veya "kod gelecek"; çift gönderim yok
        idempotency_key: `return-requested-customer:${ctx.returnId}`,
      })
      if (returnCode) await markReturnCodeSent(container, ctx.returnId, returnCode, "carrier")
      logger.info(`[return-requested-email] Customer mail sent — return=${ctx.returnId} to=${ctx.email} code=${returnCode ?? "(manual)"}`)
    } else {
      logger.warn(`[return-requested-email] Order has no email — return=${ctx.returnId}`)
    }

    const sellerMail = buildReturnRequestedSellerEmail({
      returnId: ctx.returnId,
      orderDisplayId: ctx.orderDisplayId,
      orderId: ctx.orderId,
      customerEmail: ctx.email || "—",
      customerName: ctx.customerName,
      items: ctx.items,
      customerNote: ctx.customerNote,
      source: ctx.source,
      ...tracking,
    })
    await createNotificationIdempotent(notificationService, {
      to: sellerTo,
      channel: "email",
      template: tracking.trackingNumber ? "return-label-seller" : "return-requested-seller",
      content: { subject: sellerMail.subject, html: sellerMail.html, text: sellerMail.text },
      resource_id: ctx.returnId,
      resource_type: "return",
      idempotency_key: `return-requested-seller:${ctx.returnId}`,
    })
    logger.info(`[return-requested-email] Seller mail sent — return=${ctx.returnId} to=${sellerTo}`)
  } catch (error) {
    logger.error(`[return-requested-email] Failed for return=${data.return_id}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const config: SubscriberConfig = { event: "order.return_requested" }
