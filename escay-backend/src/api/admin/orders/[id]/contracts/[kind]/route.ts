import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import {
  isOrderContractKind,
  signedOrderContractUrl,
  type OrderContractsMeta,
} from "../../../../../../lib/order-contracts"

/**
 * GET /admin/orders/:id/contracts/:kind — yeni sistemin sipariş sözleşmesi PDF'i.
 * PDF private S3'te; yalnızca admin oturumuyla 5 dk geçerli imzalı linke yönlendirir.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const kind = req.params.kind
  if (!isOrderContractKind(kind)) return res.status(404).json({ message: "Bilinmeyen sözleşme" })
  if (!process.env.S3_BUCKET) return res.status(503).json({ message: "S3 yapılandırılmamış" })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: req.params.id },
  })
  const meta = (data?.[0]?.metadata as { contracts?: OrderContractsMeta } | null)?.contracts
  const key = meta?.source === "medusa" ? meta.keys?.[kind] : undefined
  if (!key) return res.status(404).json({ message: "Bu siparişte sözleşme yok" })

  res.redirect(302, await signedOrderContractUrl(key))
}
