import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  beginReceiveReturnWorkflow,
  cancelReturnReceiveWorkflow,
  confirmReturnReceiveWorkflow,
  dismissItemReturnRequestWorkflow,
  receiveItemReturnRequestWorkflow,
} from "@medusajs/medusa/core-flows"
import { errorText } from "./ops-events"
import { isReturnRejected } from "./return-rejection"

/**
 * Ürün bazlı iade kabulü (admin, paket geldiğinde).
 *
 * Her iade kalemi için:
 *   restock_quantity  → kabul, stoğa eklenir (Medusa receive-items)
 *   damaged_quantity  → kabul, para iade edilir ama stoğa EKLENMEZ (Medusa dismiss-items)
 *   kalan             → kabul edilmedi, para iadesi yok (metadata.escay_acceptance)
 *
 * Confirm sonrası order.return_received → processReturnRefund yalnız received_quantity
 * (restock + damaged) için para iade eder; kısmi kabulde status = partially_received.
 */

export type AcceptanceInput = {
  item_id: string
  restock_quantity?: number | null
  damaged_quantity?: number | null
}

export type ReturnAcceptanceMeta = {
  at: string
  by: string | null
  reason: string | null
  /** Admin "Kargo ücretini de iade et" — processReturnRefund kargoyu sebepten bağımsız ekler. */
  refund_shipping?: boolean
  items: { item_id: string; requested: number; restock: number; damaged: number; rejected: number }[]
}

type ReturnRow = {
  id: string
  status?: string | null
  order_id?: string | null
  metadata?: Record<string, unknown> | null
  items?: { item_id?: string | null; quantity?: unknown }[] | null
}

const toInt = (v: unknown) => {
  const n = Math.floor(Number(v ?? 0))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Doğrular + Medusa adımlarına böler. Hata mesajları panelde gösterilir. */
export function planReturnAcceptance(
  returnItems: { item_id?: string | null; quantity?: unknown }[],
  input: AcceptanceInput[]
): {
  receive: { id: string; quantity: number }[]
  dismiss: { id: string; quantity: number }[]
  items: ReturnAcceptanceMeta["items"]
} {
  const byId = new Map(input.map((i) => [i.item_id, i]))
  for (const id of byId.keys()) {
    if (!returnItems.some((r) => r.item_id === id)) throw new Error(`Ürün bu iadede yok: ${id}`)
  }

  const receive: { id: string; quantity: number }[] = []
  const dismiss: { id: string; quantity: number }[] = []
  const items: ReturnAcceptanceMeta["items"] = []
  for (const r of returnItems) {
    if (!r.item_id) continue
    const requested = toInt(r.quantity)
    const row = byId.get(r.item_id)
    const restock = toInt(row?.restock_quantity)
    const damaged = toInt(row?.damaged_quantity)
    if (restock + damaged > requested) {
      throw new Error(`Kabul edilen adet talep edilenden (${requested}) fazla olamaz.`)
    }
    if (restock) receive.push({ id: r.item_id, quantity: restock })
    if (damaged) dismiss.push({ id: r.item_id, quantity: damaged })
    items.push({ item_id: r.item_id, requested, restock, damaged, rejected: requested - restock - damaged })
  }
  if (!receive.length && !dismiss.length) {
    throw new Error("Hiç ürün kabul edilmedi — tüm iadeyi reddetmek için \"Reddet\"i kullanın.")
  }
  return { receive, dismiss, items }
}

const inFlight = new Set<string>()

export async function acceptReturnItems(
  container: MedusaContainer,
  input: {
    return_id: string
    items: AcceptanceInput[]
    reason?: string | null
    refund_shipping?: boolean
    actor_id?: string | null
  }
): Promise<{ acceptance: ReturnAcceptanceMeta; partial: boolean }> {
  if (inFlight.has(input.return_id)) throw new Error("Bu iade zaten işleniyor.")
  inFlight.add(input.return_id)
  try {
    return await run(container, input)
  } finally {
    inFlight.delete(input.return_id)
  }
}

async function run(
  container: MedusaContainer,
  input: Parameters<typeof acceptReturnItems>[1]
): Promise<{ acceptance: ReturnAcceptanceMeta; partial: boolean }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "return",
    fields: ["id", "status", "order_id", "metadata", "items.item_id", "items.quantity"],
    filters: { id: input.return_id },
  })
  const ret = (data as ReturnRow[])[0]
  if (!ret) throw new Error("İade bulunamadı")
  if (ret.status !== "requested" || isReturnRejected(ret.metadata)) {
    throw new Error("Yalnız bekleyen (teslim alınmamış) iade kabul edilebilir.")
  }

  const plan = planReturnAcceptance(ret.items || [], input.items || [])
  const partial = plan.items.some((i) => i.rejected > 0)
  const acceptance: ReturnAcceptanceMeta = {
    at: new Date().toISOString(),
    by: input.actor_id || null,
    reason: input.reason?.trim() || null,
    ...(input.refund_shipping === true ? { refund_shipping: true } : {}),
    items: plan.items,
  }

  // Kabul kaydı receive'den ÖNCE: refund maili kabul edilmeyenleri buradan okur.
  await container.resolve(Modules.ORDER).updateReturns([
    { selector: { id: ret.id }, data: { metadata: { ...(ret.metadata || {}), escay_acceptance: acceptance } } },
  ])

  await beginReceiveReturnWorkflow(container).run({
    input: { return_id: ret.id, created_by: input.actor_id || undefined },
  })
  try {
    if (plan.receive.length) {
      await receiveItemReturnRequestWorkflow(container).run({ input: { return_id: ret.id, items: plan.receive } })
    }
    if (plan.dismiss.length) {
      await dismissItemReturnRequestWorkflow(container).run({ input: { return_id: ret.id, items: plan.dismiss } })
    }
    await confirmReturnReceiveWorkflow(container).run({
      input: { return_id: ret.id, confirmed_by: input.actor_id || undefined },
    })
  } catch (err) {
    // Yarım kalan teslim alma değişikliği iade'yi kilitlemesin
    try {
      await cancelReturnReceiveWorkflow(container).run({ input: { return_id: ret.id } })
    } catch (cancelErr) {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`[return-accept] receive iptal edilemedi return=${ret.id}: ${errorText(cancelErr)}`)
    }
    await container.resolve(Modules.ORDER).updateReturns([
      { selector: { id: ret.id }, data: { metadata: { ...(ret.metadata || {}), escay_acceptance: null } } },
    ])
    throw new Error(`Teslim alınamadı: ${errorText(err)}`)
  }

  return { acceptance, partial }
}
