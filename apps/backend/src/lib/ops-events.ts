import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { OPS_EVENT_MODULE } from "../modules/ops-event"
import type OpsEventModuleService from "../modules/ops-event/service"

/**
 * Operasyon olay kaydı — ödeme / iptal / kargo gibi takip edilmesi gereken anlar.
 *
 * - Her olay `ops_event` tablosuna yazılır (admin → "Logs", sipariş → "Olaylar").
 * - Mail GÖNDERİLMEZ — yalnızca kayıt + log.
 * - Asla throw etmez: olay kaydı bozulsa bile ödeme/kargo akışı etkilenmez.
 */

export type OpsEventLevel = "info" | "warning" | "error"

export type OpsEventKind =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.alert"
  | "payment.pending"
  | "order.canceled_unpaid"
  | "shipment.created"
  | "shipment.failed"
  | "shipment.attached"
  | "shipment.shipped"
  | "shipment.delivered"
  | "shipment.problem"
  | "shipment.webhook"
  | "shipment.poll"
  | "return.requested"
  | "return.code_sent"
  | "return.refund_failed"
  | "return.refunded"
  | "exchange.requested"
  | "exchange.shipped"
  | "exchange.failed"
  | "contract.failed"

export type OpsEventInput = {
  kind: OpsEventKind
  level: OpsEventLevel
  title: string
  detail?: string | null
  orderId?: string | null
  data?: Record<string, unknown> | null
  /** Aynı sipariş için bu tür olay zaten varsa yazma (tekrarlanan webhook'lar). */
  once?: boolean
  /** Aynı tür + aynı başlıkta olay zaten varsa yazma (siparişsiz olaylar da). */
  oncePerTitle?: boolean
}

const KIND_LABEL: Record<OpsEventKind, string> = {
  "payment.succeeded": "Ödeme başarılı",
  "payment.failed": "Ödeme başarısız",
  "payment.alert": "Ödeme alarmı",
  "payment.pending": "Havale bekleniyor",
  "order.canceled_unpaid": "Ödenmeyen sipariş iptal",
  "shipment.created": "Kargo gönderisi açıldı",
  "shipment.failed": "Kargo gönderisi açılamadı",
  "shipment.attached": "Mevcut gönderi bağlandı",
  "shipment.shipped": "Kargoya verildi",
  "shipment.delivered": "Teslim edildi",
  "shipment.problem": "Kargo sorunu",
  "shipment.webhook": "Kargo bildirimi",
  "shipment.poll": "Kargo yoklaması",
  "return.requested": "İade talebi alındı",
  "return.code_sent": "İade kodu gönderildi",
  "return.refund_failed": "İade parası gönderilemedi",
  "return.refunded": "İade yapıldı",
  "exchange.requested": "Değişim talebi",
  "exchange.shipped": "Değişim gönderisi açıldı",
  "exchange.failed": "Değişim gönderisi açılamadı",
  "contract.failed": "Sözleşme PDF'i oluşturulamadı",
}

/** Workflow/MedusaError düz obje gelebilir — "[object Object]" yerine mesaj. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>
    const msg = o.message ?? (o.error as Record<string, unknown> | undefined)?.message
    if (typeof msg === "string" && msg) return msg
    try {
      return JSON.stringify(err)
    } catch {
      /* fallthrough */
    }
  }
  return String(err)
}

async function displayIdFor(container: MedusaContainer, orderId: string): Promise<string | null> {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "display_id"],
      filters: { id: orderId },
    })
    const row = data?.[0] as { display_id?: number | null } | undefined
    return row?.display_id != null ? String(row.display_id) : null
  } catch {
    return null
  }
}

/** Panelde zil bildirimi düşen olaylar (hatalar her zaman düşer). */
const FEED_KINDS = new Set<OpsEventKind>([
  "payment.succeeded",
  "payment.pending",
  "payment.alert",
  "shipment.failed",
  "shipment.problem",
  "return.requested",
  "return.refund_failed",
  "exchange.requested",
  "exchange.failed",
])

/** Admin zil bildirimi (Medusa feed). Hata olay kaydını engellemez. */
async function notifyAdminFeed(
  container: MedusaContainer,
  input: OpsEventInput,
  orderDisplayId: string | number | null
): Promise<void> {
  if (!FEED_KINDS.has(input.kind) && input.level !== "error") return
  try {
    const notification = container.resolve(Modules.NOTIFICATION)
    await notification.createNotifications({
      to: "",
      channel: "feed",
      template: "admin-ui",
      resource_id: input.orderId || undefined,
      resource_type: input.orderId ? "order" : undefined,
      data: {
        title: `${KIND_LABEL[input.kind] || input.kind}${orderDisplayId ? ` — #${orderDisplayId}` : ""}`,
        description: [input.title, input.detail].filter(Boolean).join(" · ").slice(0, 500),
      },
    })
  } catch (err) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[ops-event] zil bildirimi gönderilemedi (${input.kind}): ${errorText(err)}`)
  }
}

export async function recordOpsEvent(
  container: MedusaContainer,
  input: OpsEventInput
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const log = input.level === "error" ? logger.error : input.level === "warning" ? logger.warn : logger.info
  log.call(
    logger,
    `[ops-event] ${input.kind} order=${input.orderId || "-"} ${input.title}${input.detail ? ` — ${input.detail}` : ""}`
  )

  const orderDisplayId = input.orderId ? await displayIdFor(container, input.orderId) : null
  try {
    const service = container.resolve<OpsEventModuleService>(OPS_EVENT_MODULE)
    const title = input.title.slice(0, 500)
    if ((input.once && input.orderId) || input.oncePerTitle) {
      const [, count] = await service.listAndCountOpsEvents(
        input.oncePerTitle
          ? { kind: input.kind, title, order_id: input.orderId || null }
          : { order_id: input.orderId, kind: input.kind },
        { take: 1 }
      )
      if (count > 0) return
    }
    await service.createOpsEvents({
      kind: input.kind,
      level: input.level,
      title,
      detail: input.detail ? input.detail.slice(0, 4000) : null,
      order_id: input.orderId || null,
      order_display_id: orderDisplayId,
      data: input.data ?? null,
    })
  } catch (err) {
    logger.warn(`[ops-event] kaydedilemedi (${input.kind}): ${errorText(err)}`)
    return
  }
  await notifyAdminFeed(container, input, orderDisplayId)
}
