import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { isExchangeActive } from "./exchange-plan"
import { isReturnRejected } from "./return-rejection"
import { recordOpsEvent } from "./ops-events"
import { COMPANY } from "../emails/company"
import { createNotificationIdempotent } from "./notify"

export const PAYTR_PROVIDER_ID = "pp_paytr_paytr"

export type ReturnRefundMeta = {
  status: "success" | "failed" | "skipped"
  amount?: number
  items_amount?: number
  shipping_amount?: number
  shipping_included?: boolean
  payment_id?: string
  at?: string
  error?: string
  note?: string
  /** PayTR ödemesi yok (havale) — para elle (IBAN) iade edilmeli */
  manual_required?: boolean
}

export type ReturnRefundResult = {
  ok: boolean
  skipped?: boolean
  meta: ReturnRefundMeta
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (value != null && typeof value === "object" && "value" in value) {
    return asNumber((value as { value: unknown }).value)
  }
  if (
    value != null &&
    typeof (value as { toString?: () => string }).toString === "function"
  ) {
    const n = Number(String(value))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function sellerPaysShipping(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false
  return (meta as Record<string, unknown>).seller_pays_shipping === true
}

/**
 * İade tutarı: alınan kalemler + (sebep metadata.seller_pays_shipping ise) sipariş kargosu.
 * Kargo yalnızca bir kez (önceki başarılı iadede dahil edilmediyse).
 */
export function calculateReturnRefundAmount(input: {
  returnStatus?: string | null
  returnItems: {
    item_id?: string | null
    quantity?: number | null
    received_quantity?: number | null
    reason_id?: string | null
  }[]
  orderItems: {
    id?: string
    unit_price?: unknown
    refundable_total_per_unit?: unknown
  }[]
  reasonsById: Record<string, { metadata?: unknown } | undefined>
  shippingTotal: number
  shippingAlreadyRefunded: boolean
  /** Admin kabulde "Kargo ücretini de iade et" işaretlediyse sebepten bağımsız dahil. */
  forceShipping?: boolean
}): {
  itemsAmount: number
  shippingAmount: number
  shippingIncluded: boolean
  total: number
} {
  const byId = new Map(
    input.orderItems.filter((i) => i.id).map((i) => [i.id as string, i])
  )

  let itemsAmount = 0
  let includeShipping = false

  for (const ri of input.returnItems) {
    const received = asNumber(ri.received_quantity)
    const requested = asNumber(ri.quantity)
    // Kısmi kabulde (partially_received) yalnız teslim alınan adet; kabul edilmeyen kalem para almaz.
    const qty =
      received > 0
        ? received
        : input.returnStatus === "received"
          ? requested
          : 0
    if (qty <= 0 || !ri.item_id) continue

    const line = byId.get(ri.item_id)
    const perUnit =
      asNumber(line?.refundable_total_per_unit) || asNumber(line?.unit_price)
    itemsAmount += perUnit * qty

    const reason = ri.reason_id ? input.reasonsById[ri.reason_id] : undefined
    if (sellerPaysShipping(reason?.metadata)) {
      includeShipping = true
    }
  }

  itemsAmount = roundMoney(itemsAmount)

  const shippingIncluded =
    (includeShipping || input.forceShipping === true) &&
    !input.shippingAlreadyRefunded &&
    input.shippingTotal > 0
  const shippingAmount = shippingIncluded
    ? roundMoney(input.shippingTotal)
    : 0

  return {
    itemsAmount,
    shippingAmount,
    shippingIncluded,
    total: roundMoney(itemsAmount + shippingAmount),
  }
}

async function markReturnRefund(
  scope: MedusaContainer,
  returnId: string,
  existingMeta: Record<string, unknown> | null | undefined,
  refundMeta: ReturnRefundMeta
) {
  const orderModule = scope.resolve(Modules.ORDER)

  await orderModule.updateReturns([
    {
      selector: { id: returnId },
      data: {
        metadata: {
          ...(existingMeta || {}),
          paytr_refund: refundMeta,
        },
      },
    },
  ])
}

/**
 * Para iadesi yapılamadı → Logs olayı + satıcıya mail. Panelde görünmeyen
 * başarısız iade kalmasın (havale siparişi elle, PayTR hatası "Tekrar dene").
 */
async function alertRefundFailed(
  scope: MedusaContainer,
  input: { returnId: string; orderId: string; meta: ReturnRefundMeta }
): Promise<void> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)
  const { returnId, orderId, meta } = input
  const amount = (meta.amount ?? 0).toFixed(2)
  const title = meta.manual_required
    ? `Havale siparişi iadesi elle yapılmalı (${amount} TL)`
    : `PayTR iadesi başarısız (${amount} TL)`
  const detail = meta.manual_required
    ? "Ödeme PayTR ile alınmamış. Müşteriye IBAN'a havale yapın, Paraşüt'te iade faturasını elle kesin, müşteriye bilgi verin."
    : `Hata: ${meta.error || "bilinmiyor"}. Sipariş sayfasında iade kutusundan "Tekrar dene".`
  try {
    await recordOpsEvent(scope, {
      kind: "return.refund_failed",
      level: "error",
      title,
      detail,
      orderId,
      data: { return_id: returnId, amount: meta.amount ?? null, error: meta.error ?? null },
    })
  } catch (err) {
    logger.warn(`[return-refund] ops event yazılamadı return=${returnId}: ${String(err)}`)
  }
  try {
    const notification = scope.resolve(Modules.NOTIFICATION)
    const to = process.env.RETURNS_INBOX || process.env.CONTACT_INBOX || COMPANY.emailOps
    const subject = `⚠ ${title} — iade ${returnId.slice(-8)}`
    const text = `${title}\n\n${detail}\n\nİade: ${returnId}\nSipariş: ${orderId}`
    await createNotificationIdempotent(notification, {
      to,
      channel: "email",
      template: "return-refund-failed",
      content: {
        subject,
        text,
        html: `<p><strong>${title}</strong></p><p>${detail}</p><p>İade: ${returnId}<br>Sipariş: ${orderId}</p>`,
      },
      resource_id: returnId,
      resource_type: "return",
      idempotency_key: `return-refund-failed:${returnId}:${meta.at || ""}`,
    })
  } catch (err) {
    logger.warn(`[return-refund] uyarı maili gönderilemedi return=${returnId}: ${String(err)}`)
  }
}

/**
 * Return received sonrası PayTR refund. Idempotent: paytr_refund.status=success ise skip.
 * Fail'de return status değişmez; metadata.paytr_refund=failed (admin retry).
 */
export async function processReturnRefund(
  scope: MedusaContainer,
  input: { return_id: string; order_id?: string }
): Promise<ReturnRefundResult> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const returnId = input.return_id

  const { data: returns } = await query.graph({
    entity: "return",
    fields: [
      "id",
      "status",
      "order_id",
      "metadata",
      "items.*",
      "items.reason_id",
      "items.item_id",
      "items.quantity",
      "items.received_quantity",
    ],
    filters: { id: returnId },
  })

  const ret = returns?.[0] as
    | {
        id: string
        status?: string | null
        order_id: string
        metadata?: Record<string, unknown> | null
        items?: {
          item_id?: string | null
          quantity?: number | null
          received_quantity?: number | null
          reason_id?: string | null
        }[]
      }
    | undefined

  if (!ret?.id || !ret.order_id) {
    const meta: ReturnRefundMeta = {
      status: "skipped",
      error: "Return not found",
      at: new Date().toISOString(),
    }
    return { ok: false, skipped: true, meta }
  }

  // CRITICAL: rejected returns must NEVER refund (even if status is received)
  if (isReturnRejected(ret.metadata)) {
    logger.info(
      `[return-refund] Skip — return=${returnId} rejected (escay_rejection)`
    )
    const meta: ReturnRefundMeta = {
      status: "skipped",
      error: "Return rejected — refund blocked",
      at: new Date().toISOString(),
      note: "escay_rejection",
    }
    const existingSkip = ret.metadata?.paytr_refund as ReturnRefundMeta | null
    if (existingSkip?.status !== "skipped" || existingSkip?.note !== "escay_rejection") {
      await markReturnRefund(scope, returnId, ret.metadata, meta)
    }
    return { ok: false, skipped: true, meta }
  }

  // Değişim: para iadesi yok, yerine yeni ürün gönderilir (lib/exchange.ts).
  // Kayıt yazılmaz — değişim iptal edilirse aynı çağrı parayı iade eder.
  if (isExchangeActive(ret.metadata)) {
    logger.info(`[return-refund] Skip — return=${returnId} değişim (escay_exchange)`)
    return {
      ok: false,
      skipped: true,
      meta: { status: "skipped", note: "escay_exchange", at: new Date().toISOString() },
    }
  }

  const existing = (ret.metadata?.paytr_refund || null) as ReturnRefundMeta | null
  if (existing?.status === "success") {
    logger.info(
      `[return-refund] Idempotent skip — return=${returnId} already refunded`
    )
    return { ok: true, skipped: true, meta: existing }
  }

  if (
    ret.status !== "received" &&
    ret.status !== "partially_received"
  ) {
    const meta: ReturnRefundMeta = {
      status: "skipped",
      error: `Return status is ${ret.status || "unknown"} (need received)`,
      at: new Date().toISOString(),
    }
    await markReturnRefund(scope, returnId, ret.metadata, meta)
    return { ok: false, skipped: true, meta }
  }

  const orderId = input.order_id || ret.order_id

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "shipping_total",
      "currency_code",
      "summary.pending_difference",
      "items.id",
      "items.unit_price",
      "items.refundable_total_per_unit",
      "payment_collections.id",
      "payment_collections.payments.id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.amount",
      "payment_collections.payments.captures.*",
      "payment_collections.payments.refunds.*",
      "returns.id",
      "returns.metadata",
      "returns.status",
    ],
    filters: { id: orderId },
  })

  const order = orders?.[0] as
    | {
        id: string
        shipping_total?: unknown
        summary?: { pending_difference?: unknown } | null
        items?: {
          id?: string
          unit_price?: unknown
          refundable_total_per_unit?: unknown
        }[]
        payment_collections?: {
          payments?: {
            id?: string
            provider_id?: string | null
            amount?: unknown
            captures?: { amount?: unknown }[]
            refunds?: { amount?: unknown }[]
          }[]
        }[]
        returns?: {
          id?: string
          metadata?: Record<string, unknown> | null
          status?: string | null
        }[]
      }
    | undefined

  if (!order?.id) {
    const meta: ReturnRefundMeta = {
      status: "failed",
      error: "Order not found",
      at: new Date().toISOString(),
    }
    await markReturnRefund(scope, returnId, ret.metadata, meta)
    return { ok: false, meta }
  }

  const reasonIds = [
    ...new Set(
      (ret.items || [])
        .map((i) => i.reason_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const reasonsById: Record<string, { metadata?: unknown }> = {}
  if (reasonIds.length) {
    const { data: reasons } = await query.graph({
      entity: "return_reason",
      fields: ["id", "value", "metadata"],
      filters: { id: reasonIds },
    })
    for (const r of reasons || []) {
      const row = r as { id?: string; metadata?: unknown }
      if (row.id) reasonsById[row.id] = { metadata: row.metadata }
    }
  }

  const shippingAlreadyRefunded = (order.returns || []).some((r) => {
    if (!r?.id || r.id === returnId) return false
    const pr = r.metadata?.paytr_refund as ReturnRefundMeta | undefined
    return pr?.status === "success" && pr.shipping_included === true
  })

  const calc = calculateReturnRefundAmount({
    returnStatus: ret.status,
    returnItems: ret.items || [],
    orderItems: order.items || [],
    reasonsById,
    shippingTotal: asNumber(order.shipping_total),
    shippingAlreadyRefunded,
    forceShipping:
      (ret.metadata?.escay_acceptance as { refund_shipping?: unknown } | undefined)
        ?.refund_shipping === true,
  })

  // Receive sonrası Medusa pending_difference genelde kalem kredisini taşır (kargo hariç).
  const pending = asNumber(order.summary?.pending_difference)
  const pendingItemsOwed = pending < 0 ? roundMoney(Math.abs(pending)) : 0
  const itemsAmount =
    pendingItemsOwed > 0 ? pendingItemsOwed : calc.itemsAmount
  const shippingAmount = calc.shippingAmount
  const shippingIncluded = calc.shippingIncluded
  const total = roundMoney(itemsAmount + shippingAmount)

  if (total <= 0) {
    const meta: ReturnRefundMeta = {
      status: "skipped",
      amount: 0,
      items_amount: itemsAmount,
      shipping_amount: shippingAmount,
      shipping_included: shippingIncluded,
      error: "Refund amount is zero",
      at: new Date().toISOString(),
    }
    await markReturnRefund(scope, returnId, ret.metadata, meta)
    logger.warn(`[return-refund] Zero amount — return=${returnId}`)
    return { ok: false, skipped: true, meta }
  }

  const payments =
    order.payment_collections?.flatMap((pc) => pc.payments || []) || []
  const paytrPayment = payments.find((p) => {
    if (!p?.id || p.provider_id !== PAYTR_PROVIDER_ID) return false
    const captured = (p.captures || []).reduce(
      (s, c) => s + asNumber(c.amount),
      0
    )
    return captured > 0
  })

  if (!paytrPayment?.id) {
    const meta: ReturnRefundMeta = {
      status: "failed",
      amount: total,
      items_amount: itemsAmount,
      shipping_amount: shippingAmount,
      shipping_included: shippingIncluded,
      error: "No captured PayTR payment on order",
      manual_required: true,
      at: new Date().toISOString(),
    }
    await markReturnRefund(scope, returnId, ret.metadata, meta)
    await alertRefundFailed(scope, { returnId, orderId, meta })
    return { ok: false, meta }
  }

  const alreadyRefunded = (paytrPayment.refunds || []).reduce(
    (s, r) => s + asNumber(r.amount),
    0
  )
  const captured = (paytrPayment.captures || []).reduce(
    (s, c) => s + asNumber(c.amount),
    0
  )
  const remaining = roundMoney(Math.max(0, captured - alreadyRefunded))
  const amount = roundMoney(Math.min(total, remaining))

  if (amount <= 0) {
    const meta: ReturnRefundMeta = {
      status: "skipped",
      amount: 0,
      items_amount: itemsAmount,
      shipping_amount: shippingAmount,
      shipping_included: shippingIncluded,
      payment_id: paytrPayment.id,
      error: "No remaining capturable amount to refund",
      at: new Date().toISOString(),
    }
    await markReturnRefund(scope, returnId, ret.metadata, meta)
    return { ok: false, skipped: true, meta }
  }

  try {
    await refundPaymentWorkflow(scope).run({
      input: {
        payment_id: paytrPayment.id,
        amount,
        note: `return ${returnId}`,
      },
    })

    const meta: ReturnRefundMeta = {
      status: "success",
      amount,
      items_amount: itemsAmount,
      shipping_amount: shippingAmount,
      shipping_included: shippingIncluded,
      payment_id: paytrPayment.id,
      at: new Date().toISOString(),
      note: `return ${returnId}`,
    }
    await markReturnRefund(scope, returnId, ret.metadata, meta)
    logger.info(
      `[return-refund] Success — return=${returnId} amount=${amount} ` +
        `shipping_included=${shippingIncluded} payment=${paytrPayment.id}`
    )

    try {
      const eventBus = scope.resolve(Modules.EVENT_BUS) as {
        emit: (event: {
          name: string
          data: Record<string, unknown>
        }) => Promise<unknown>
      }
      await eventBus.emit({
        name: "escay.return_refunded",
        data: {
          return_id: returnId,
          order_id: orderId,
          amount,
          shipping_included: shippingIncluded,
          payment_id: paytrPayment.id,
        },
      })
    } catch (emitErr) {
      logger.error(
        `[return-refund] Failed to emit escay.return_refunded — return=${returnId}: ${String(emitErr)}`
      )
    }

    return { ok: true, meta }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const meta: ReturnRefundMeta = {
      status: "failed",
      amount,
      items_amount: itemsAmount,
      shipping_amount: shippingAmount,
      shipping_included: shippingIncluded,
      payment_id: paytrPayment.id,
      error: message.slice(0, 500),
      at: new Date().toISOString(),
    }
    try {
      await markReturnRefund(scope, returnId, ret.metadata, meta)
    } catch (markErr) {
      logger.error(
        `[return-refund] Failed to mark return metadata — return=${returnId}: ${String(markErr)}`
      )
    }
    logger.error(
      `[return-refund] PayTR refund failed — return=${returnId}: ${message}`
    )
    await alertRefundFailed(scope, { returnId, orderId, meta })
    return { ok: false, meta }
  }
}
