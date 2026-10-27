import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { issueSalesInvoiceForOrder } from "../lib/parasut-invoice"
import type { ParasutOrderInvoiceMeta } from "../modules/parasut"
import { shouldRetryParasutInvoice } from "../modules/parasut/options"

/**
 * error / pending Parasut faturalarını yeniden dene.
 * Idempotent: issued → skip; pending resume aynı invoice_id.
 *
 * Env:
 *   PARASUT_RETRY_MAX_ATTEMPTS (default 8)
 *   PARASUT_RETRY_LOOKBACK_HOURS (default 72)
 */
export default async function retryParasutInvoicesJob(
  container: MedusaContainer
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const maxAttempts = Math.max(
    1,
    Number(process.env.PARASUT_RETRY_MAX_ATTEMPTS || 8) || 8
  )
  const lookbackHours = Math.max(
    1,
    Number(process.env.PARASUT_RETRY_LOOKBACK_HOURS || 72) || 72
  )
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)

  logger.info(
    `[parasut-retry] start — maxAttempts=${maxAttempts} lookback=${lookbackHours}h`
  )

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "created_at", "metadata"],
    filters: {
      created_at: { $gte: cutoff },
      status: { $nin: ["canceled"] },
    },
  })

  const candidates = (orders || []) as {
    id: string
    status?: string | null
    metadata?: Record<string, unknown> | null
  }[]

  let attempted = 0
  let issued = 0
  let skipped = 0
  let failed = 0

  for (const order of candidates) {
    const inv = (order.metadata?.parasut_invoice ||
      null) as ParasutOrderInvoiceMeta | null
    if (!inv) {
      skipped++
      continue
    }
    if (inv.status === "draft_dryrun") {
      logger.info(
        `[parasut-retry] Skip draft_dryrun order=${order.id} invoice=${inv.invoice_id} (resmileştirilmez)`
      )
      skipped++
      continue
    }
    if (inv.status === "issued" || inv.status === "skipped" || inv.status === "canceled") {
      skipped++
      continue
    }
    if (!shouldRetryParasutInvoice(inv.status)) {
      skipped++
      continue
    }

    const retries = Number(inv.retry_count || 0)
    if (retries >= maxAttempts) {
      logger.warn(
        `[parasut-retry] max attempts reached order=${order.id} retries=${retries}`
      )
      skipped++
      continue
    }

    attempted++
    try {
      // retry_count artır (issue öncesi) — başarısızda da sayılır
      const orderModule = container.resolve(Modules.ORDER)
      await orderModule.updateOrders([
        {
          id: order.id,
          metadata: {
            ...(order.metadata || {}),
            parasut_invoice: {
              ...inv,
              retry_count: retries + 1,
            },
          },
        },
      ])

      const result = await issueSalesInvoiceForOrder(container, order.id)
      if (result.ok && result.meta.status === "issued") {
        issued++
        logger.info(
          `[parasut-retry] Issued order=${order.id} no=${result.meta.invoice_number}`
        )
      } else if (result.skipped) {
        skipped++
      } else {
        failed++
        logger.error(
          `[parasut-retry] Still failing order=${order.id}: ${result.meta.error || result.meta.status}`
        )
      }
    } catch (err) {
      failed++
      logger.error(
        `[parasut-retry] order=${order.id} error: ${String(err)}`
      )
    }
  }

  logger.info(
    `[parasut-retry] done — candidates=${candidates.length} attempted=${attempted} issued=${issued} failed=${failed} skipped=${skipped}`
  )
}

export const config = {
  name: "retry-parasut-invoices",
  // Her 15 dakikada
  schedule: "*/15 * * * *",
}
