import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { resolveDefaultStockLocationId } from "../../../lib/default-stock-location"

/**
 * Admin receive/confirm öncesi: return.location_id boşsa tek lokasyonu (Es Çay Depo) yaz.
 * Native confirmReturnReceiveWorkflow restock bunu kullanır — elle stok yok.
 */
export async function ensureReturnReceiveLocation(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const returnId = req.params?.id
  if (!returnId) {
    return next()
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "return",
      fields: ["id", "location_id"],
      filters: { id: returnId },
    })
    const row = data?.[0] as
      | { id?: string; location_id?: string | null }
      | undefined
    if (!row?.id || row.location_id) {
      return next()
    }

    const locationId = await resolveDefaultStockLocationId(req.scope)
    if (!locationId) {
      const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
      logger.warn(
        `[return-location] No stock location — receive may skip restock return=${returnId}`
      )
      return next()
    }

    const orderModule = req.scope.resolve(Modules.ORDER)
    await orderModule.updateReturns([
      {
        selector: { id: returnId },
        data: { location_id: locationId },
      },
    ])

    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.info(
      `[return-location] Set location_id=${locationId} on return=${returnId}`
    )
  } catch (err) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `[return-location] Failed to set location on return=${returnId}: ${String(err)}`
    )
  }

  return next()
}
