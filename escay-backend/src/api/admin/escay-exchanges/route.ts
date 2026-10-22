import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { listAdminExchanges } from "../../../lib/exchange-admin-list"

/** GET /admin/escay-exchanges — Medusa + WP değişimleri tek listede (en yeni önce) + durum sayıları. */
export const GET = async (_req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const rows = await listAdminExchanges(_req.scope)
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.state] = (counts[r.state] || 0) + 1
  res.json({ exchanges: rows, counts, total: rows.length })
}
