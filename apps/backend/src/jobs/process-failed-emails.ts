import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { processFailedEmails } from "../lib/failed-emails"
import { errorText } from "../lib/ops-events"

export default async function processFailedEmailsJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const result = await processFailedEmails(container)
    if (result.retried || result.unresolved) {
      logger.warn(
        `[failed-emails] denenen=${result.retried} kurtarılan=${result.recovered} çözülmeyen=${result.unresolved}`
      )
    }
  } catch (err) {
    logger.error(`[failed-emails] ${errorText(err)}`)
  }
}

export const config = {
  name: "process-failed-emails",
  schedule: "*/15 * * * *",
}
