import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  issueSalesInvoiceForOrder,
  markStalePendingInvoiceUnknown,
} from "../lib/bizimhesap-invoice"
import type { BizimhesapOrderInvoiceMeta } from "../modules/bizimhesap"
import { shouldRetryBizimhesapInvoice } from "../modules/bizimhesap/options"

/** Gönderim süresini (30 sn + kilit) rahat aşan eşik. */
const STALE_PENDING_MS = 10 * 60 * 1000

/**
 * `error` (BizimHesap reddetti) faturaları yeniden dene.
 * `pending` takılı kaldıysa `unknown`a çevirip uyarır; belirsiz kayıt tekrar GÖNDERİLMEZ.
 *
 * Env:
 *   BIZIMHESAP_RETRY_MAX_ATTEMPTS (default 8)
 *   BIZIMHESAP_RETRY_LOOKBACK_HOURS (default 72)
 */
export default async function retryBizimhesapInvoicesJob(
  container: MedusaContainer
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const maxAttempts = Math.max(
    1,
    Number(process.env.BIZIMHESAP_RETRY_MAX_ATTEMPTS || 8) || 8
  )
  const lookbackHours = Math.max(
    1,
    Number(process.env.BIZIMHESAP_RETRY_LOOKBACK_HOURS || 72) || 72
  )
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)

  logger.info(
    `[bizimhesap-retry] start — maxAttempts=${maxAttempts} lookback=${lookbackHours}h`
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
    metadata?: Record<string, unknown> | null
  }[]

  let attempted = 0
  let created = 0
  let skipped = 0
  let failed = 0

  for (const order of candidates) {
    const inv = (order.metadata?.bizimhesap_invoice ||
      null) as BizimhesapOrderInvoiceMeta | null
    if (!inv) {
      skipped++
      continue
    }

    if (inv.status === "pending") {
      const age = Date.now() - new Date(inv.at || 0).getTime()
      if (age > STALE_PENDING_MS) {
        try {
          await markStalePendingInvoiceUnknown(container, order.id, inv)
          logger.error(
            `[bizimhesap-retry] Takılı pending → unknown order=${order.id} (panelden kontrol)`
          )
        } catch (err) {
          logger.error(`[bizimhesap-retry] order=${order.id} error: ${String(err)}`)
        }
      }
      skipped++
      continue
    }

    if (!shouldRetryBizimhesapInvoice(inv.status)) {
      skipped++
      continue
    }

    const retries = Number(inv.retry_count || 0)
    if (retries >= maxAttempts) {
      logger.warn(
        `[bizimhesap-retry] max attempts reached order=${order.id} retries=${retries}`
      )
      skipped++
      continue
    }

    attempted++
    try {
      // retry_count artır (issue öncesi) — başarısızda da sayılır
      await container.resolve(Modules.ORDER).updateOrders([
        {
          id: order.id,
          metadata: {
            ...(order.metadata || {}),
            bizimhesap_invoice: {
              ...inv,
              retry_count: retries + 1,
            },
          },
        },
      ])

      const result = await issueSalesInvoiceForOrder(container, order.id)
      if (result.ok && result.meta.status === "created") {
        created++
        logger.info(
          `[bizimhesap-retry] Created order=${order.id} guid=${result.meta.guid}`
        )
      } else if (result.skipped) {
        skipped++
      } else {
        failed++
        logger.error(
          `[bizimhesap-retry] Still failing order=${order.id}: ${result.meta.error || result.meta.status}`
        )
      }
    } catch (err) {
      failed++
      logger.error(`[bizimhesap-retry] order=${order.id} error: ${String(err)}`)
    }
  }

  logger.info(
    `[bizimhesap-retry] done — candidates=${candidates.length} attempted=${attempted} created=${created} failed=${failed} skipped=${skipped}`
  )
}

export const config = {
  name: "retry-bizimhesap-invoices",
  // Her 15 dakikada
  schedule: "*/15 * * * *",
}
