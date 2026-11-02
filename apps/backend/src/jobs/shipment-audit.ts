import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { runShipmentAudit } from "../lib/shipping/shipment-audit"

/**
 * Günlük kargo denetimi (salt okunur) — her sabah 07:00 (sunucu saati).
 * Ödendi/kargo yok, bekleyen etiket, geciken teslim, iptalde açık gönderi,
 * aynı gönderi iki kayıtta + adaptör hesap/bakiye kontrolü → Logs.
 * Elle kargoda da çalışır (adaptör gerektirmez).
 */
export default async function shipmentAuditJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { checked, findings, healthWarnings } = await runShipmentAudit(container)
  logger.info(`[shipment-audit] orders=${checked} findings=${findings.length} health_warnings=${healthWarnings.length}`)
}

export const config = {
  name: "shipment-audit",
  schedule: "0 7 * * *",
}
