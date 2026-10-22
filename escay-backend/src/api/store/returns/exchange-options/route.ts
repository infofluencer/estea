import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadExchangeOptions } from "../../../../lib/exchange"
import { normalizeEmail, orderNotFound } from "../../orders/_shared"

type Body = { order_id?: string; email?: string | null }

/**
 * POST /store/returns/exchange-options — iade formunda "Değişim" seçilince her
 * ürün için seçilebilecek beden/renkler (aynı ürün, stokta olanlar).
 * Üye: oturum + sipariş sahibi; misafir: sipariş e-postası. Yanlış eşleşmede 404.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const body = (req.body || {}) as Body
  const orderId = String(body.order_id || "").trim()
  if (!orderId) orderNotFound()

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "email", "customer_id"],
    filters: { id: orderId, is_draft_order: false },
  })
  const row = data?.[0] as { id?: string; email?: string | null; customer_id?: string | null } | undefined
  const customerId = req.auth_context?.actor_id
  const owner = Boolean(row?.id && customerId && row.customer_id === customerId)
  const emailOk = Boolean(row?.id && normalizeEmail(body.email) && normalizeEmail(body.email) === normalizeEmail(row.email))
  if (!owner && !emailOk) orderNotFound()

  const items = await loadExchangeOptions(req.scope, orderId)
  res.json({
    items: items.map((i) => ({
      item_id: i.item_id,
      title: i.title,
      variant: i.variant,
      // Mağazada stok adedi gösterilmez; yalnız seçilebilir mi
      choices: i.choices.map((c) => ({
        variant_id: c.variant_id,
        title: c.title,
        in_stock: c.available === null || c.available > 0,
      })),
    })),
  })
}
