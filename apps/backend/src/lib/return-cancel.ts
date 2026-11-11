import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { cancelReturnReceiveWorkflow, cancelReturnWorkflow } from "@medusajs/medusa/core-flows"

import { recordOpsEvent } from "./ops-events"

/**
 * İade talebini iptal et (müşteri vazgeçti / yanlış açıldı). Reddetmeden farkı:
 * müşteriye mail gitmez. Yalnız paket teslim alınmadan: stok ve para hareketi yok.
 * Para iadesi kilidi, iptalden ÖNCE metadata'ya yazılır (red ile aynı sıra).
 */
export async function cancelStoreReturn(
  scope: MedusaContainer,
  input: { return_id: string; reason?: string | null; canceled_by?: string | null }
): Promise<{ return_id: string; order_id: string }> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "return",
    fields: ["id", "status", "order_id", "metadata", "canceled_at", "items.received_quantity"],
    filters: { id: input.return_id },
  })
  const ret = data?.[0] as
    | {
        id: string
        status?: string | null
        order_id: string
        metadata?: Record<string, unknown> | null
        canceled_at?: string | Date | null
        items?: { received_quantity?: number | null }[]
      }
    | undefined
  if (!ret?.id || !ret.order_id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "İade bulunamadı.")
  if (ret.canceled_at || ret.status === "canceled") return { return_id: ret.id, order_id: ret.order_id }

  const received = (ret.items || []).some((i) => Number(i.received_quantity || 0) > 0)
  if (ret.status !== "requested" || received) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Teslim alınmış iade iptal edilemez."
    )
  }

  const at = new Date().toISOString()
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 500) : null
  await scope.resolve(Modules.ORDER).updateReturns([
    {
      selector: { id: ret.id },
      data: {
        metadata: {
          ...(ret.metadata || {}),
          escay_cancel: { at, reason, canceled_by: input.canceled_by || null },
          paytr_refund: { status: "skipped", error: "Return canceled — refund blocked", at, note: "escay_cancel" },
        },
      },
    },
  ])

  try {
    await cancelReturnReceiveWorkflow(scope).run({ input: { return_id: ret.id } })
  } catch {
    // açık teslim alma değişikliği yok — sorun değil
  }
  await cancelReturnWorkflow(scope).run({
    input: { return_id: ret.id, canceled_by: input.canceled_by || undefined },
  })

  await recordOpsEvent(scope, {
    kind: "return.canceled",
    level: "info",
    title: "İade talebi iptal edildi (panelden)",
    detail: reason,
    orderId: ret.order_id,
    data: { return_id: ret.id, by: input.canceled_by || null },
  })
  return { return_id: ret.id, order_id: ret.order_id }
}
