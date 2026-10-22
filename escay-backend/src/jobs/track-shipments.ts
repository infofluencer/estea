import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { listCarrierAdapters } from "../modules/carrier/registry"
import { trackOpenShipments } from "../lib/shipping/track-shipments"

/**
 * Kargo durumu yoklaması (30 dk) — yalnız `getStatus` sunan adaptörler için.
 * Adaptör yoksa (elle kargo) no-op.
 */
export default async function trackShipmentsJob(container: MedusaContainer) {
  if (!listCarrierAdapters().some((a) => typeof a.getStatus === "function")) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { checked, changed } = await trackOpenShipments(container)
  if (checked) logger.info(`[track-shipments] checked=${checked} changed=${changed}`)
}

export const config = {
  name: "track-shipments",
  schedule: "*/30 * * * *",
}
