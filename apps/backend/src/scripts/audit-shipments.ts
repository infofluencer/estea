/**
 * Kargo denetimini elle çalıştır (günlük job'un aynısı, salt okunur; bulgular Logs'a düşer).
 *   npx medusa exec ./src/scripts/audit-shipments.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { runShipmentAudit } from "../lib/shipping/shipment-audit"

export default async function auditShipments({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (m: string) => void; warn: (m: string) => void }
  const { checked, findings, healthWarnings } = await runShipmentAudit(container)
  logger.info(`[audit-shipments] ${checked} sipariş tarandı, ${findings.length} bulgu`)
  for (const f of findings) logger.warn(`[audit-shipments] ${f.level.toUpperCase()} ${f.title} — ${f.detail}`)
  for (const w of healthWarnings) logger.warn(`[audit-shipments] HESAP ${w}`)
}
