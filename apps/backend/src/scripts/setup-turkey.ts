/**
 * One-shot Türkiye market setup for Es Çay (prod-safe, idempotent).
 *
 * 1. Store TRY + Türkiye region + KDV + TR shipping
 * 2. Removes Medusa default Europe region / EU tax / demo shipping
 * 3. Prints publishable key + storefront env
 *
 * Run (local):  npm run setup:turkey
 * Run (Docker): docker exec BACK npm run setup:turkey:prod
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import seedEscay from "./seed-escay"
import ensurePublishableKey from "./ensure-publishable-key"

export default async function setupTurkey(args: ExecArgs) {
  const logger = args.container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info("=== Es Çay Türkiye kurulumu başlıyor ===")
  await seedEscay(args)
  await ensurePublishableKey(args)
  logger.info("=== Türkiye kurulumu tamamlandı ===")
  logger.info(
    "Frontend NEXT_PUBLIC_MEDUSA_REGION_ID değerini Dokploy'a yaz → rebuild"
  )
}
