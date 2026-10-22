import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  PaymentActions,
} from "@medusajs/framework/utils"
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows"
import {
  BANK_TRANSFER_PROVIDER_ID,
  isBankTransferOrder,
} from "./bank-transfer"
import { resolvePaymentModule, type PaymentSessionLike } from "../modules/paytr/order-guards"
import { recordOpsEvent } from "./ops-events"

type SessionRow = PaymentSessionLike & { provider_id?: string | null }

type OrderRow = {
  id: string
  status?: string | null
  canceled_at?: string | Date | null
  total?: number | string | null
  currency_code?: string | null
  metadata?: Record<string, unknown> | null
  payment_collections?: {
    status?: string | null
    payment_sessions?: SessionRow[] | null
  }[] | null
}

export type BankTransferOrderState = {
  is_bank_transfer: boolean
  /** pending: ödeme bekleniyor · received: alındı · canceled: sipariş iptal */
  state: "pending" | "received" | "canceled" | null
  amount: number | null
  currency_code: string | null
  received_at: string | null
}

async function loadOrder(container: MedusaContainer, orderId: string): Promise<OrderRow | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "canceled_at",
      "total",
      "currency_code",
      "metadata",
      "payment_collections.status",
      "payment_collections.payment_sessions.id",
      "payment_collections.payment_sessions.provider_id",
      "payment_collections.payment_sessions.status",
      "payment_collections.payment_sessions.amount",
      "payment_collections.payment_sessions.currency_code",
      "payment_collections.payment_sessions.payment_collection_id",
      "payment_collections.payment_sessions.data",
    ],
    filters: { id: orderId },
  })
  return (data?.[0] as OrderRow | undefined) ?? null
}

function bankTransferSession(order: OrderRow): SessionRow | null {
  const sessions = (order.payment_collections || []).flatMap((pc) => pc.payment_sessions || [])
  return sessions.find((s) => s.provider_id === BANK_TRANSFER_PROVIDER_ID) ?? null
}

function isPaid(order: OrderRow): boolean {
  return (order.payment_collections || []).some((pc) => {
    const st = String(pc.status || "").toLowerCase()
    return st === "completed" || st === "authorized" || st === "captured"
  })
}

export async function getBankTransferOrderState(
  container: MedusaContainer,
  orderId: string
): Promise<BankTransferOrderState> {
  const order = await loadOrder(container, orderId)
  const session = order ? bankTransferSession(order) : null
  if (!order || (!session && !isBankTransferOrder(order))) {
    return { is_bank_transfer: false, state: null, amount: null, currency_code: null, received_at: null }
  }
  const data = (session?.data || {}) as Record<string, unknown>
  const state = isPaid(order)
    ? "received"
    : order.status === "canceled" || order.canceled_at
      ? "canceled"
      : "pending"
  return {
    is_bank_transfer: true,
    state,
    amount: order.total != null ? Number(order.total) : null,
    currency_code: order.currency_code ?? null,
    received_at: typeof data.received_at === "string" ? data.received_at : null,
  }
}

/**
 * Admin "Havale alındı": session'a received yaz → processPaymentWorkflow
 * SUCCESSFUL (authorize + capture) → payment.captured subscriber'ları
 * (onay maili, kargo, Paraşüt) PayTR'deki gibi çalışır.
 *
 * Aynı sipariş için eşzamanlı iki tıklama lock ile tek capture'a iner.
 */
export async function confirmBankTransferPayment(
  container: MedusaContainer,
  orderId: string,
  actorId?: string
): Promise<BankTransferOrderState> {
  const locking = container.resolve(Modules.LOCKING) as {
    execute: <T>(
      keys: string | string[],
      job: () => Promise<T>,
      args?: { timeout?: number; ttl?: number }
    ) => Promise<T>
  }

  return locking.execute(
    `bank-transfer-confirm:${orderId}`,
    async () => {
      const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
      const order = await loadOrder(container, orderId)
      if (!order) throw new Error("Sipariş bulunamadı.")
      if (order.status === "canceled" || order.canceled_at) {
        throw new Error("İptal edilmiş sipariş için havale onaylanamaz.")
      }
      const session = bankTransferSession(order)
      if (!session) throw new Error("Bu sipariş havale ile verilmemiş.")
      if (isPaid(order)) return getBankTransferOrderState(container, orderId)

      const payment = resolvePaymentModule(container)
      await payment.updatePaymentSession({
        id: session.id,
        currency_code: String(session.currency_code || "try"),
        amount: session.amount ?? 0,
        data: {
          ...((session.data || {}) as Record<string, unknown>),
          bank_transfer_status: "received",
          received_at: new Date().toISOString(),
          received_by: actorId || null,
        },
      })

      await processPaymentWorkflow(container).run({
        input: {
          action: PaymentActions.SUCCESSFUL,
          data: {
            session_id: session.id,
            amount: Number(session.amount ?? 0),
          },
        },
      })

      logger.info(
        `[havale] Ödeme onaylandı — order=${orderId} session=${session.id} amount=${String(session.amount)} by=${actorId || "-"}`
      )
      await recordOpsEvent(container, {
        kind: "payment.succeeded",
        level: "info",
        title: `Havale / EFT ödemesi admin'den onaylandı — ${Number(session.amount ?? 0).toFixed(2)} TL`,
        orderId,
        data: { by: actorId || null, method: "bank_transfer" },
      })
      return getBankTransferOrderState(container, orderId)
    },
    { timeout: 30, ttl: 120 }
  )
}
