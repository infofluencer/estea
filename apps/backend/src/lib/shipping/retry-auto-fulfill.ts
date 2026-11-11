/**
 * Ödendi ama kargo kaydı HİÇ açılamamış siparişleri yeniden dener (jobs/retry-auto-fulfill.ts).
 *
 * Ödeme sonrası kargo kaydı (subscribers/payment-captured-fulfillment.ts) firma yavaş ya da
 * erişilemezken başarısız olabilir. Sipariş bu yüzden İPTAL EDİLMEZ; ödenmiş olarak bekler ve
 * bu iş kaydı kendiliğinden açmayı dener. Firma tarafında çift kayıt riski yok: adaptör sipariş
 * başına sabit referans gönderir (CarrierAdapter kuralı; DHL'de 3002 → mevcut kayıtla devam).
 *
 * Yalnız hiç kargo kaydı olmayan siparişler: iptal edilmiş kaydı olan sipariş admin kararıdır
 * (reship / iade öncesi bekletme), otomatik yeniden açılmaz. İadesi yapılmış ödeme de atlanır.
 *
 * Env:
 *   SHIPPING_RETRY_GRACE_MINUTES (15)  — ödeme sonrası ilk denemenin bitmesi için bekleme
 *   SHIPPING_RETRY_LOOKBACK_HOURS (72) — bundan eski siparişler günlük denetime kalır
 *   SHIPPING_RETRY_MAX_ATTEMPTS (12)   — sonra bırakır, Logs'a hata yazar
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { autoFulfillPaidOrder } from "../auto-fulfill-order"
import { errorText, recordOpsEvent } from "../ops-events"
import { envInt } from "./shipment-audit"

export const RETRY_METADATA_KEY = "escay_auto_fulfill_retry"

export type RetryState = { attempts: number; last_at?: string; last_error?: string; gave_up?: boolean }

export type RetryOrder = {
  id: string
  display_id?: number | string | null
  status?: string | null
  created_at?: string | Date | null
  metadata?: Record<string, unknown> | null
  payment_collections?: { status?: string | null; refunded_amount?: number | string | null }[] | null
  fulfillments?: { id: string }[] | null
}

export type RetryOptions = { now?: Date; graceMinutes?: number; maxAttempts?: number }

const PAID = new Set(["captured", "completed"])

export function readRetryState(metadata: Record<string, unknown> | null | undefined): RetryState {
  const raw = metadata?.[RETRY_METADATA_KEY] as Partial<RetryState> | undefined
  const attempts = Number(raw?.attempts)
  return { ...(raw || {}), attempts: Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0 }
}

/** Saf seçim: hangi siparişler yeniden denenecek. */
export function pickRetryTargets(orders: RetryOrder[], opts: RetryOptions = {}): RetryOrder[] {
  const now = (opts.now ?? new Date()).getTime()
  const graceMs = (opts.graceMinutes ?? 15) * 60_000
  const maxAttempts = opts.maxAttempts ?? 12
  return orders.filter((o) => {
    if ((o.status || "").toLowerCase() === "canceled") return false
    const collections = o.payment_collections || []
    if (!collections.some((p) => PAID.has((p.status || "").toLowerCase()))) return false
    if (collections.some((p) => Number(p.refunded_amount) > 0)) return false
    // İptal edilmiş kayıt da sayılır: admin bilerek iptal etmiş olabilir.
    if ((o.fulfillments || []).length) return false
    const created = o.created_at ? new Date(o.created_at).getTime() : NaN
    if (!Number.isFinite(created) || now - created < graceMs) return false
    const state = readRetryState(o.metadata)
    return !state.gave_up && state.attempts < maxAttempts
  })
}

export type RetrySummary = { candidates: number; created: number; failed: number; gaveUp: number }

type Deps = {
  fulfill?: typeof autoFulfillPaidOrder
  load?: (container: MedusaContainer, since: Date) => Promise<RetryOrder[]>
  now?: () => Date
}

async function loadOrders(container: MedusaContainer, since: Date): Promise<RetryOrder[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const take = 200
  const out: RetryOrder[] = []
  for (let page = 0; page < 50; page++) {
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "status",
        "created_at",
        "metadata",
        "payment_collections.status",
        "payment_collections.refunded_amount",
        "fulfillments.id",
      ],
      filters: { created_at: { $gte: since.toISOString() }, status: { $nin: ["canceled"] } },
      pagination: { take, skip: page * take, order: { created_at: "ASC" } },
    })
    const rows = (data as RetryOrder[]) || []
    out.push(...rows)
    if (rows.length < take) break
  }
  return out
}

export async function retryPaidUnfulfilled(container: MedusaContainer, deps: Deps = {}): Promise<RetrySummary> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const now = deps.now ?? (() => new Date())
  const maxAttempts = envInt("SHIPPING_RETRY_MAX_ATTEMPTS", 12)
  const since = new Date(now().getTime() - envInt("SHIPPING_RETRY_LOOKBACK_HOURS", 72) * 3_600_000)
  const orders = await (deps.load ?? loadOrders)(container, since)
  const targets = pickRetryTargets(orders, {
    now: now(),
    graceMinutes: envInt("SHIPPING_RETRY_GRACE_MINUTES", 15),
    maxAttempts,
  })
  const summary: RetrySummary = { candidates: targets.length, created: 0, failed: 0, gaveUp: 0 }
  if (!targets.length) return summary

  const fulfill = deps.fulfill ?? autoFulfillPaidOrder
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }

  for (const order of targets) {
    const attempt = readRetryState(order.metadata).attempts + 1
    let message: string | null = null
    let fulfillmentId: string | undefined
    let skipped: string | undefined
    try {
      const result = await fulfill(container, order.id)
      if (result.ok) {
        fulfillmentId = result.fulfillmentId
        skipped = result.skipped
      } else {
        message = result.message
      }
    } catch (error) {
      message = errorText(error)
    }

    if (message === null) {
      if (skipped) continue // bu arada açılmış / açılacak kalem yok
      summary.created++
      await recordOpsEvent(container, {
        kind: "shipment.created",
        level: "info",
        title: "Kargo gönderisi yeniden denemede açıldı",
        detail: `Ödeme sonrası ilk deneme başarısız olmuştu; ${attempt}. otomatik denemede açıldı.`,
        orderId: order.id,
        data: { fulfillment_id: fulfillmentId, attempt },
      })
      continue
    }

    summary.failed++
    const gaveUp = attempt >= maxAttempts
    logger.warn(`[retry-auto-fulfill] order=${order.id} deneme ${attempt}/${maxAttempts} başarısız: ${message}`)
    try {
      // autoFulfillPaidOrder bu arada metadata.email yazmış olabilir → taze oku, üstüne ekle.
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({ entity: "order", fields: ["id", "metadata"], filters: { id: order.id } })
      const fresh = ((data as { metadata?: Record<string, unknown> | null }[])?.[0]?.metadata || order.metadata || {}) as Record<string, unknown>
      const state: RetryState = { attempts: attempt, last_at: now().toISOString(), last_error: message.slice(0, 500), ...(gaveUp ? { gave_up: true } : {}) }
      await orderModule.updateOrders(order.id, { metadata: { ...fresh, [RETRY_METADATA_KEY]: state } })
    } catch (error) {
      logger.warn(`[retry-auto-fulfill] deneme sayacı yazılamadı order=${order.id}: ${errorText(error)}`)
    }
    if (gaveUp) {
      summary.gaveUp++
      await recordOpsEvent(container, {
        kind: "shipment.failed",
        level: "error",
        title: "Kargo gönderisi otomatik denemelerde açılamadı",
        detail: `${maxAttempts} deneme başarısız, otomatik deneme bırakıldı. Sipariş ödenmiş olarak bekliyor (iptal edilmedi).\nSon hata: ${message}\n\nAdmin → sipariş → "Kargo" kutusundan yeniden deneyin ya da şubede açıp "Dış gönderi" ile bağlayın.`,
        orderId: order.id,
        data: { attempts: attempt },
      })
    }
  }
  return summary
}
