import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getConfiguredCarrier } from "../modules/carrier/registry"
import { trackOpenShipments } from "../lib/shipping/track-shipments"

/**
 * Kargo durumu yoklaması (30 dk) — yalnız seçili adaptör (`SHIPPING_CARRIER`) `getStatus`
 * sunuyorsa. Elle kargoda no-op (adaptör kayıtlı olsa da kimliksiz sorgu atılmaz).
 */
export default async function trackShipmentsJob(container: MedusaContainer) {
  if (typeof getConfiguredCarrier()?.getStatus !== "function") return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { checked, changed } = await trackOpenShipments(container)
  if (checked) logger.info(`[track-shipments] checked=${checked} changed=${changed}`)
}

export const config = {
  name: "track-shipments",
  schedule: "*/30 * * * *",
}
