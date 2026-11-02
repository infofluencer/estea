import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { reconcileShipments, type ReconcileRow } from "../../../../lib/shipping/reconcile-shipments"

type Body = { rows?: ReconcileRow[]; apply?: boolean }

/**
 * POST /admin/escay-shipments/reconcile  { rows: [{ order_reference?, tracking_number?, shipment_ref?, status? }], apply? }
 * Firma raporuyla uzlaştırma. apply yoksa kuru çalışma (yalnız plan döner).
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const body = (req.validatedBody || req.body || {}) as Body
  const rows = Array.isArray(body.rows) ? body.rows : []
  if (!rows.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "rows boş.")
  if (rows.length > 500) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Tek seferde en fazla 500 satır.")
  const results = await reconcileShipments(req.scope, rows, {
    apply: Boolean(body.apply),
    actorId: req.auth_context?.actor_id || null,
  })
  res.json({ apply: Boolean(body.apply), results })
}
