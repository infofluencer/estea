import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const PREFERRED_NAME = "Es Çay Depo"

/**
 * Tek (veya tercih edilen) stock location — auto-fulfill / return restock.
 * Elle stok yazılmaz; sadece location_id çözülür.
 */
export async function resolveDefaultStockLocationId(
  scope: MedusaContainer
): Promise<string | undefined> {
  const stock = scope.resolve(Modules.STOCK_LOCATION) as {
    listStockLocations: (
      filters?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<{ id: string; name?: string | null }[]>
  }

  const locations = await stock.listStockLocations({}, { take: 20 })
  if (!locations?.length) return undefined

  const preferred = locations.find(
    (l) => (l.name || "").trim().toLowerCase() === PREFERRED_NAME.toLowerCase()
  )
  return preferred?.id || locations[0]?.id
}
