import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { classifyReturn } from "../../../lib/return-admin-list"

type OrderRow = {
  status?: string | null
  metadata?: Record<string, unknown> | null
  payment_collections?: { status?: string | null }[] | null
  fulfillments?: { canceled_at?: string | null; shipped_at?: string | null }[] | null
}

/** Son siparişler/iadeler yeter — rozet "yapılacak iş" sayısı, arşiv değil. */
const RECENT = 300

/**
 * Admin: GET /admin/escay-nav-counts — kenar çubuğu rozetleri.
 * returns: bekleyen + sorunlu iade; orders: kargolanacak (ödenmiş, etiket basılmamış,
 * kargoya verilmemiş) + havale bekleyen.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: returns } = await query.graph({
    entity: "return",
    fields: ["id", "status", "metadata"],
    pagination: { take: RECENT, order: { created_at: "DESC" } },
  })
  const returnCount = (returns as { status?: string | null; metadata?: Record<string, unknown> | null }[])
    .map(classifyReturn)
    .filter((s) => s === "open" || s === "problem").length

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "metadata",
      "payment_collections.status",
      "fulfillments.canceled_at",
      "fulfillments.shipped_at",
    ],
    pagination: { take: RECENT, order: { created_at: "DESC" } },
  })
  let toShip = 0
  let awaitingBankTransfer = 0
  for (const o of orders as OrderRow[]) {
    if ((o.status || "").toLowerCase() === "canceled") continue
    const pcs = (o.payment_collections || []).map((p) => (p.status || "").toLowerCase())
    const paid = pcs.some((s) => ["captured", "completed", "authorized"].includes(s))
    if (!paid) {
      if (o.metadata?.payment_method === "bank_transfer" && pcs.some((s) => s === "awaiting" || s === "not_paid")) {
        awaitingBankTransfer++
      }
      continue
    }
    const shipped = (o.fulfillments || []).some((f) => !f.canceled_at && f.shipped_at)
    if (!shipped && !o.metadata?.label_printed_at) toShip++
  }

  res.json({ returns: returnCount, orders: toShip + awaitingBankTransfer, to_ship: toShip, awaiting_bank_transfer: awaitingBankTransfer })
}
