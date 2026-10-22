import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  ADMIN_RETURN_STATES,
  classifyReturn,
  type AdminReturnState,
} from "../../../lib/return-admin-list"

type ReturnRow = {
  id: string
  status?: string | null
  created_at?: string | Date | null
  order_id?: string | null
  metadata?: Record<string, unknown> | null
  items?: {
    item_id?: string | null
    quantity?: number | null
    received_quantity?: number | null
    reason_id?: string | null
  }[] | null
}

type OrderRow = {
  id: string
  display_id?: number | null
  email?: string | null
  shipping_address?: { first_name?: string | null; last_name?: string | null } | null
  items?: { id: string; title?: string | null; variant_title?: string | null }[] | null
}

/** Son iadeler; eski kayıtlar sayfada gösterilmez. */
const MAX_RETURNS = 500

/**
 * Admin: GET /admin/escay-returns?state=open|received|refunded|problem|rejected|canceled
 * Tüm iadeler tek listede (en yeni önce) + durum sayıları.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const stateParam = String((req.query as Record<string, unknown>).state || "")
  const state = ADMIN_RETURN_STATES.includes(stateParam as AdminReturnState)
    ? (stateParam as AdminReturnState)
    : null

  const { data: returns } = await query.graph({
    entity: "return",
    fields: [
      "id",
      "status",
      "created_at",
      "order_id",
      "metadata",
      "items.item_id",
      "items.quantity",
      "items.received_quantity",
      "items.reason_id",
    ],
    pagination: { take: MAX_RETURNS, order: { created_at: "DESC" } },
  })
  const rows = (returns || []) as ReturnRow[]

  const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))] as string[]
  const { data: orders } = orderIds.length
    ? await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "email",
          "shipping_address.first_name",
          "shipping_address.last_name",
          "items.id",
          "items.title",
          "items.variant_title",
        ],
        filters: { id: orderIds },
      })
    : { data: [] }
  const orderById = new Map((orders as OrderRow[]).map((o) => [o.id, o]))

  const { data: reasons } = await query.graph({
    entity: "return_reason",
    fields: ["id", "label"],
  })
  const reasonLabel = new Map(
    (reasons as { id: string; label?: string | null }[]).map((r) => [r.id, r.label || ""])
  )

  const counts: Record<AdminReturnState, number> = {
    open: 0,
    received: 0,
    refunded: 0,
    problem: 0,
    rejected: 0,
    canceled: 0,
  }

  const list = rows.map((r) => {
    const s = classifyReturn(r)
    counts[s]++
    const order = r.order_id ? orderById.get(r.order_id) : undefined
    const lineById = new Map((order?.items || []).map((i) => [i.id, i]))
    const meta = r.metadata || {}
    const refund = (meta.paytr_refund || null) as
      | { amount?: number; error?: string; manual_required?: boolean }
      | null
    const addr = order?.shipping_address
    return {
      id: r.id,
      state: s,
      created_at: r.created_at,
      order_id: r.order_id,
      order_display_id: order?.display_id ?? null,
      customer: [addr?.first_name, addr?.last_name].filter(Boolean).join(" ") || order?.email || "",
      email: order?.email || "",
      source: typeof meta.source === "string" ? meta.source : null,
      customer_note: typeof meta.customer_note === "string" ? meta.customer_note : null,
      return_code: typeof meta.return_code === "string" ? meta.return_code : null,
      tracking_number: typeof meta.return_tracking_number === "string" ? meta.return_tracking_number : null,
      exchange: Boolean(
        meta.escay_exchange && (meta.escay_exchange as { status?: string }).status !== "canceled"
      ),
      refund_amount: refund?.amount ?? null,
      refund_error: refund?.error ?? null,
      manual_required: refund?.manual_required === true,
      items: (r.items || []).map((it) => {
        const line = it.item_id ? lineById.get(it.item_id) : undefined
        return {
          title: [line?.title, line?.variant_title].filter(Boolean).join(" · ") || "Ürün",
          quantity: it.quantity ?? 0,
          received_quantity: it.received_quantity ?? 0,
          reason: it.reason_id ? reasonLabel.get(it.reason_id) || null : null,
        }
      }),
    }
  })

  res.json({
    returns: state ? list.filter((r) => r.state === state) : list,
    counts,
    total: rows.length,
  })
}
