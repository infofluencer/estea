import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"

export const PAYTR_PROVIDER_ID = "pp_paytr_paytr"

export function paytrCallbackLockKey(merchantOid: string): string {
  return `paytr-callback:${merchantOid}`
}

/** Payment statuses that mean money was authorized/taken — never auto-cancel. */
const PAID_PAYMENT_STATUSES = new Set([
  "authorized",
  "partially_authorized",
  "captured",
  "partially_captured",
  "partially_refunded",
  "refunded",
])

const UNPAID_PAYMENT_STATUSES = new Set([
  "not_paid",
  "awaiting",
  "requires_action",
  "canceled",
])

export type OrderCancelGuard = {
  id: string
  status?: string | null
  payment_status?: string | null
  canceled_at?: Date | string | null
}

export type PaymentSessionLike = {
  id: string
  status?: string | null
  currency_code?: string | null
  amount?: number | string | null
  payment_collection_id?: string | null
  data?: Record<string, unknown> | null
}

export function isOrderUnpaidSafeToCancel(order: OrderCancelGuard): boolean {
  if (!order?.id) return false
  if (order.status === "canceled" || order.canceled_at) return false
  const ps = String(order.payment_status || "")
  if (PAID_PAYMENT_STATUSES.has(ps)) return false
  if (ps && !UNPAID_PAYMENT_STATUSES.has(ps)) {
    // Unknown / unexpected status — refuse cancel to avoid refunding paid orders
    return false
  }
  return true
}

type PaymentModule = {
  retrievePaymentSession: (id: string) => Promise<PaymentSessionLike>
  updatePaymentSession: (data: {
    id: string
    data: Record<string, unknown>
    currency_code: string
    amount: number | string
    status?: string
  }) => Promise<PaymentSessionLike>
  listPaymentSessions: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<PaymentSessionLike[]>
}

export function resolvePaymentModule(container: MedusaContainer): PaymentModule {
  return container.resolve(Modules.PAYMENT) as PaymentModule
}

/**
 * Mark PayTR callback as processed on the payment session data.
 * Requires currency_code + amount (Medusa UpdatePaymentSessionDTO).
 */
export async function markCallbackProcessed(
  container: MedusaContainer,
  session: PaymentSessionLike,
  extras: Record<string, unknown> = {}
): Promise<void> {
  const payment = resolvePaymentModule(container)
  const prev = (session.data || {}) as Record<string, unknown>
  const currencyCode = String(session.currency_code || "try")
  const amount = session.amount ?? 0

  await payment.updatePaymentSession({
    id: session.id,
    currency_code: currencyCode,
    amount,
    data: {
      ...prev,
      ...extras,
      callback_processed: true,
      callback_processed_at: new Date().toISOString(),
    },
  })
}

export async function findPaymentSessionByMerchantOid(
  container: MedusaContainer,
  merchantOid: string
): Promise<PaymentSessionLike | null> {
  if (!merchantOid) return null
  const payment = resolvePaymentModule(container)
  const pageSize = 100
  let skip = 0
  for (;;) {
    const sessions = await payment.listPaymentSessions(
      { provider_id: PAYTR_PROVIDER_ID },
      {
        select: ["id", "data", "status", "currency_code", "amount", "payment_collection_id"],
        take: pageSize,
        skip,
      }
    )
    const hit = sessions.find(
      (s) => (s.data as Record<string, unknown> | undefined)?.merchant_oid === merchantOid
    )
    if (hit) return hit
    if (sessions.length < pageSize) return null
    skip += pageSize
    if (skip > 50_000) return null
  }
}

export async function findOrderIdForPaymentSession(
  container: MedusaContainer,
  session: PaymentSessionLike
): Promise<string | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as {
    graph: (args: Record<string, unknown>) => Promise<{ data: unknown }>
  }

  const collectionId = session.payment_collection_id
  if (collectionId) {
    const { data: links } = await query.graph({
      entity: "order_payment_collection",
      fields: ["order_id", "payment_collection_id"],
      filters: { payment_collection_id: collectionId },
    })
    const rows = (links || []) as { order_id?: string }[]
    if (rows[0]?.order_id) return rows[0].order_id
  }

  // Fallback: payment_collection → cart → order_cart (complete sonrası)
  if (collectionId) {
    const { data: cartLinks } = await query.graph({
      entity: "cart_payment_collection",
      fields: ["cart_id", "payment_collection_id"],
      filters: { payment_collection_id: collectionId },
    })
    const cartId = (cartLinks as { cart_id?: string }[])?.[0]?.cart_id
    if (cartId) {
      const { data: orderCarts } = await query.graph({
        entity: "order_cart",
        fields: ["order_id", "cart_id"],
        filters: { cart_id: cartId },
      })
      const orderId = (orderCarts as { order_id?: string }[])?.[0]?.order_id
      if (orderId) return orderId
    }
  }

  return null
}

export async function retrieveOrderForCancelGuard(
  container: MedusaContainer,
  orderId: string
): Promise<OrderCancelGuard | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as {
    graph: (args: Record<string, unknown>) => Promise<{ data: unknown }>
  }
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "payment_status", "canceled_at"],
    filters: { id: orderId },
  })
  const order = (data as OrderCancelGuard[])?.[0]
  return order?.id ? order : null
}

/**
 * Cancel via Medusa cancelOrderWorkflow only when unpaid.
 * Releases reservations through Medusa core (no manual inventory ops).
 */
export async function cancelUnpaidOrderIfSafe(
  container: MedusaContainer,
  orderId: string,
  logPrefix: string
): Promise<{ canceled: boolean; skipped?: string }> {
  const logger = container.resolve("logger") as {
    info: (m: string) => void
    warn: (m: string) => void
    error: (m: string) => void
  }

  const order = await retrieveOrderForCancelGuard(container, orderId)
  if (!order) {
    logger.warn(`${logPrefix} order not found — ${orderId}`)
    return { canceled: false, skipped: "not_found" }
  }

  if (!isOrderUnpaidSafeToCancel(order)) {
    logger.info(
      `${logPrefix} skip cancel — order=${orderId} status=${order.status} payment_status=${order.payment_status}`
    )
    return { canceled: false, skipped: "not_unpaid_or_already_canceled" }
  }

  try {
    await cancelOrderWorkflow(container).run({
      input: {
        order_id: orderId,
        no_notification: true,
      },
    })
    logger.info(`${logPrefix} canceled unpaid order=${orderId}`)
    return { canceled: true }
  } catch (err) {
    const msg = describeError(err)
    // Already canceled / validate guard — treat as idempotent success
    if (/already been canceled|canceled previously|cannot be canceled/i.test(msg)) {
      logger.info(`${logPrefix} cancel noop (already canceled) — ${orderId}: ${msg}`)
      return { canceled: false, skipped: "already_canceled" }
    }
    // Kargo kaydı olan ödenmemiş sipariş (elle fulfill / demo): otomatik iptal
    // edilmez — admin karar verir. Hata değil, her turda tekrar denenmesin diye skip.
    if (/fulfillments must be canceled/i.test(msg)) {
      logger.warn(
        `${logPrefix} skip cancel — order=${orderId} has active fulfillments (admin review)`
      )
      return { canceled: false, skipped: "has_fulfillments" }
    }
    logger.error(`${logPrefix} cancelOrderWorkflow failed — ${orderId}: ${msg}`)
    throw err
  }
}

/** Workflow hataları düz obje gelir — String(err) "[object Object]" yazar. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>
    if (typeof rec.message === "string" && rec.message) return rec.message
    try {
      return JSON.stringify(err).slice(0, 500)
    } catch {
      /* fallthrough */
    }
  }
  return String(err)
}
