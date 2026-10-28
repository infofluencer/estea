import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  PAYTR_PROVIDER_ID,
  cancelUnpaidOrderIfSafe,
  describeError,
  isOrderUnpaidSafeToCancel,
  paytrCallbackLockKey,
} from "../modules/paytr/order-guards"
import { recordOpsEvent } from "../lib/ops-events"

/**
 * PayTR iframe vazgeçme / timeout: callback gelmeyen unpaid siparişleri iptal et.
 * Stok, cancelOrderWorkflow → Medusa reservation release ile serbest kalır.
 *
 * Env:
 *   UNPAID_ORDER_TIMEOUT_MINUTES (default 30)
 */
export default async function cancelUnpaidPaytrOrdersJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger") as {
    info: (m: string) => void
    warn: (m: string) => void
    error: (m: string) => void
  }

  const timeoutMinutes = Math.max(
    1,
    Number(process.env.UNPAID_ORDER_TIMEOUT_MINUTES || 30) || 30
  )
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000)

  logger.info(
    `[unpaid-paytr-cleanup] start — timeout=${timeoutMinutes}m cutoff=${cutoff.toISOString()}`
  )

  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as {
    graph: (args: Record<string, unknown>) => Promise<{ data: unknown }>
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "payment_status",
      "canceled_at",
      "created_at",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.payment_sessions.id",
      "payment_collections.payment_sessions.provider_id",
      "payment_collections.payment_sessions.status",
      "payment_collections.payment_sessions.data",
    ],
    filters: {
      status: "pending",
      created_at: { $lte: cutoff },
    },
  })

  const candidates = (orders || []) as {
    id: string
    status?: string | null
    payment_status?: string | null
    canceled_at?: Date | string | null
    created_at?: Date | string | null
    payment_collections?: {
      payment_sessions?: {
        id?: string
        provider_id?: string | null
        status?: string | null
        data?: Record<string, unknown> | null
      }[]
    }[]
  }[]

  let canceled = 0
  let skipped = 0

  for (const order of candidates) {
    if (!isOrderUnpaidSafeToCancel(order)) {
      skipped++
      continue
    }

    const sessions =
      order.payment_collections?.flatMap((pc) => pc.payment_sessions || []) ||
      []
    const paytrSessions = sessions.filter(
      (s) => s.provider_id === PAYTR_PROVIDER_ID
    )

    // Yalnızca PayTR siparişleri; ödeme session'ı authorized/captured ise dokunma
    if (!paytrSessions.length) {
      skipped++
      continue
    }

    const stillPending = paytrSessions.some((s) => {
      const st = String(s.status || "")
      return (
        st === "pending" ||
        st === "pending_authorization" ||
        st === "error" ||
        st === "requires_more"
      )
    })

    const anyPaidSession = paytrSessions.some((s) => {
      const st = String(s.status || "")
      return st === "authorized" || st === "captured"
    })

    if (anyPaidSession || !stillPending) {
      skipped++
      continue
    }

    const oid = paytrSessions
      .map((s) =>
        typeof s.data?.merchant_oid === "string" ? s.data.merchant_oid : ""
      )
      .find((v) => v)

    try {
      const runCancel = () =>
        cancelUnpaidOrderIfSafe(container, order.id, "[unpaid-paytr-cleanup]")

      const result = oid
        ? await (
            container.resolve(Modules.LOCKING) as {
              execute: <T>(
                keys: string | string[],
                job: () => Promise<T>,
                args?: { timeout?: number; ttl?: number }
              ) => Promise<T>
            }
          ).execute(paytrCallbackLockKey(oid), runCancel, {
            timeout: 30,
            ttl: 120,
          })
        : await runCancel()
      if (result.canceled) {
        canceled++
        await recordOpsEvent(container, {
          kind: "order.canceled_unpaid",
          level: "warning",
          title: `Ödeme ${timeoutMinutes} dk içinde tamamlanmadı — sipariş iptal`,
          detail: "Müşteri PayTR ödeme ekranını tamamlamadı (vazgeçti / sayfadan ayrıldı). Para çekilmedi.",
          orderId: order.id,
          data: { merchant_oid: oid || null },
        })
      } else skipped++
    } catch (err) {
      logger.error(
        `[unpaid-paytr-cleanup] order=${order.id} error: ${describeError(err)}`
      )
    }
  }

  logger.info(
    `[unpaid-paytr-cleanup] done — candidates=${candidates.length} canceled=${canceled} skipped=${skipped}`
  )
}

export const config = {
  name: "cancel-unpaid-paytr-orders",
  // Her 10 dakikada bir
  schedule: "*/10 * * * *",
}
