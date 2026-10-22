import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BANK_TRANSFER_METHOD } from "../../../lib/bank-transfer"

/**
 * Admin sipariş listesi "Ödeme" sütunu: ödenmemiş havale siparişi Medusa'da
 * PayTR'ı bekleyen kart siparişi gibi "awaiting" (Bekleniyor) görünür.
 * Liste yanıtında yalnızca bunları "requires_action" yaparız; admin çevirisi
 * (orders.payment.status.requiresAction) → "Havale onayı bekleniyor".
 *
 * requires_action başka hiçbir akışta üretilmiyor (PayTR / havale provider'ı
 * pending_authorization kullanır). Yalnızca GET /admin/orders yanıtı değişir;
 * veri, filtreler ve sipariş detayı aynı kalır.
 */
export const PENDING_BANK_TRANSFER_LIST_STATUS = "requires_action"

type ListOrder = { id?: string; payment_status?: string }

export function markPendingBankTransfersInList(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const send = res.json.bind(res)
  res.json = ((body: unknown) => {
    const orders = (body as { orders?: ListOrder[] } | null)?.orders
    const awaitingIds = Array.isArray(orders)
      ? orders.filter((o) => o?.payment_status === "awaiting" && o.id).map((o) => o.id as string)
      : []
    if (!awaitingIds.length) return send(body)

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    query
      .graph({ entity: "order", fields: ["id", "metadata"], filters: { id: awaitingIds } })
      .then(({ data }) => {
        const bankTransferIds = new Set(
          (data as { id: string; metadata?: Record<string, unknown> | null }[])
            .filter((o) => o.metadata?.payment_method === BANK_TRANSFER_METHOD)
            .map((o) => o.id)
        )
        for (const o of orders!) {
          if (o.id && bankTransferIds.has(o.id)) o.payment_status = PENDING_BANK_TRANSFER_LIST_STATUS
        }
      })
      .catch(() => {
        /* etiket süsü — hata olursa liste olduğu gibi döner */
      })
      .finally(() => send(body))
    return res
  }) as typeof res.json
  next()
}
