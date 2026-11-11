import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"

import { buildOrderCanceledCustomerEmail } from "../emails/order-canceled"
import { createNotificationIdempotent } from "./notify"
import { errorText, recordOpsEvent } from "./ops-events"
import { cancelOpenFulfillmentStrict } from "./reship-fulfillment"
import { PAYTR_PROVIDER_ID } from "./return-refund"

type Money = unknown
type OrderRow = {
  id: string
  display_id?: number | null
  status?: string | null
  canceled_at?: unknown
  email?: string | null
  currency_code?: string | null
  metadata?: Record<string, unknown> | null
  fulfillments?: { id: string; canceled_at?: unknown; shipped_at?: unknown; delivered_at?: unknown }[] | null
  payment_collections?: {
    payments?: { id: string; provider_id?: string | null; captures?: { amount?: Money }[]; refunds?: { amount?: Money }[] }[]
  }[] | null
}

export type CancelOrderResult = {
  order_id: string
  shipments_canceled: number
  refund_amount: number
  /** Kartla (PayTR) ödenmemiş çekim var: para elle iade edilmeli */
  manual_refund: boolean
}

const num = (v: Money) =>
  v && typeof v === "object" && "value" in (v as object) ? Number((v as { value: unknown }).value) : Number(v || 0)
const round = (n: number) => Math.round(n * 100) / 100

/** Kargoya verilmemiş / teslim edilmemiş sipariş panelden iptal edilebilir mi. */
export function orderCancelBlocker(order: Pick<OrderRow, "status" | "canceled_at" | "fulfillments">): string | null {
  if (order.canceled_at || order.status === "canceled") return "Sipariş zaten iptal."
  if (order.status === "completed") return "Tamamlanmış sipariş iptal edilemez; iade sürecini kullanın."
  const active = (order.fulfillments || []).filter((f) => !f.canceled_at)
  if (active.some((f) => f.delivered_at)) return "Sipariş teslim edilmiş; iptal yerine iade açın."
  if (active.some((f) => f.shipped_at)) return "Sipariş kargoya verilmiş; iptal yerine iade açın."
  return null
}

/**
 * Kargoya verilmemiş siparişi iptal et:
 *  1) Açık kargo kayıtları firmada iptal edilir — firma reddederse DURUR (para dokunulmaz).
 *  2) Medusa cancelOrderWorkflow: rezervasyonlar (stok) bırakılır, çekilmiş ödeme
 *     sağlayıcıdan iade edilir (PayTR → /odeme/iade). Hata olursa sipariş açık kalır,
 *     kargo kaydı iptal olmuş olarak kalır; aynı işlem tekrar denenebilir.
 *  3) Olay kaydı + müşteriye iptal maili. Kesilmiş fatura varsa elle iade faturası uyarısı.
 */
export async function cancelUnshippedOrder(
  scope: MedusaContainer,
  input: { orderId: string; reason?: string | null; actorId?: string | null }
): Promise<CancelOrderResult> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "canceled_at",
      "email",
      "currency_code",
      "metadata",
      "fulfillments.id",
      "fulfillments.canceled_at",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "payment_collections.payments.id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captures.amount",
      "payment_collections.payments.refunds.amount",
    ],
    filters: { id: input.orderId },
  })
  const order = data?.[0] as OrderRow | undefined
  if (!order?.id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Sipariş bulunamadı.")
  const blocker = orderCancelBlocker(order)
  if (blocker) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, blocker)

  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 500) : null

  // 1) Kargo
  let shipmentsCanceled = 0
  for (const f of (order.fulfillments || []).filter((x) => !x.canceled_at)) {
    try {
      await cancelOpenFulfillmentStrict(scope, { orderId: order.id, fulfillmentId: f.id })
      shipmentsCanceled++
    } catch (error) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Sipariş iptal edilmedi: ${errorText(error)}`)
    }
  }

  // İade edilecek tutar (Medusa çekilmiş − iade edilmiş kadarını iade eder)
  const payments = (order.payment_collections || []).flatMap((pc) => pc.payments || [])
  let refundAmount = 0
  let manualRefund = false
  for (const p of payments) {
    const left = round(
      (p.captures || []).reduce((s, c) => s + num(c.amount), 0) -
        (p.refunds || []).reduce((s, r) => s + num(r.amount), 0)
    )
    if (left <= 0) continue
    refundAmount = round(refundAmount + left)
    if (p.provider_id !== PAYTR_PROVIDER_ID) manualRefund = true
  }

  // 2) Sipariş + para iadesi
  try {
    await cancelOrderWorkflow(scope).run({
      input: { order_id: order.id, canceled_by: input.actorId || undefined },
    })
  } catch (error) {
    const message = errorText(error)
    await recordOpsEvent(scope, {
      kind: "order.canceled",
      level: "error",
      title: "Sipariş iptal edilemedi (para iadesi)",
      detail: `${shipmentsCanceled ? "Kargo kaydı iptal edildi; " : ""}sipariş açık kaldı. Hata: ${message}. Sorunu giderip tekrar "Siparişi iptal et" deyin.`,
      orderId: order.id,
      data: { by: input.actorId || null },
    })
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `${shipmentsCanceled ? "Kargo kaydı iptal edildi ama " : ""}sipariş iptal edilemedi: ${message}`
    )
  }

  await scope.resolve(Modules.ORDER).updateOrders([
    {
      id: order.id,
      metadata: {
        ...(order.metadata || {}),
        escay_cancel: {
          at: new Date().toISOString(),
          reason,
          by: input.actorId || null,
          refund_amount: refundAmount,
          manual_refund: manualRefund,
          shipments_canceled: shipmentsCanceled,
        },
      },
    },
  ])

  // 3) Kayıt, uyarılar, mail
  const money = `${refundAmount.toFixed(2)} TL`
  await recordOpsEvent(scope, {
    kind: "order.canceled",
    level: manualRefund ? "warning" : "info",
    title:
      refundAmount <= 0
        ? "Sipariş iptal edildi (panelden)"
        : manualRefund
          ? `Sipariş iptal edildi, ${money} elle iade edilmeli`
          : `Sipariş iptal edildi, ${money} karta iade edildi`,
    detail: [
      shipmentsCanceled ? "Kargo kaydı firmada iptal edildi." : null,
      manualRefund ? "Ödeme kartla alınmamış (havale): tutarı müşterinin IBAN'ına gönderin." : null,
      reason ? `Sebep: ${reason}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    orderId: order.id,
    data: { refund_amount: refundAmount, manual_refund: manualRefund, by: input.actorId || null },
  })

  const invoice = order.metadata?.bizimhesap_invoice as { status?: string } | undefined
  if (invoice?.status === "created") {
    await recordOpsEvent(scope, {
      kind: "invoice.refund_manual",
      level: "warning",
      title: "İptal edilen siparişin faturası kesilmiş",
      detail: "BizimHesap'ta iade faturasını elle kesin.",
      orderId: order.id,
    })
  }

  if (order.email) {
    try {
      const mail = buildOrderCanceledCustomerEmail({
        orderDisplayId: order.display_id ?? order.id,
        refundAmount,
        currencyCode: (order.currency_code || "try").toUpperCase(),
        manualRefund,
        reason,
      })
      await createNotificationIdempotent(scope.resolve(Modules.NOTIFICATION), {
        to: order.email,
        channel: "email",
        template: "order-canceled-customer",
        content: { subject: mail.subject, html: mail.html, text: mail.text },
        resource_id: order.id,
        resource_type: "order",
        idempotency_key: `order-canceled-customer:${order.id}`,
      })
    } catch (error) {
      logger.warn(`[order-cancel] müşteri maili gönderilemedi order=${order.id}: ${errorText(error)}`)
    }
  }

  return { order_id: order.id, shipments_canceled: shipmentsCanceled, refund_amount: refundAmount, manual_refund: manualRefund }
}
