import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  NotificationStatus,
} from "@medusajs/framework/utils"
import { sendOrderConfirmationEmail } from "./order-confirmation-email"
import { dailyTitle, errorText, recordOpsEvent } from "./ops-events"

const LOOKBACK_MS = 24 * 60 * 60 * 1000
const MAX_ROWS = 1000
/** İş 15 dakikada bir çalışır: yaklaşık 2 saatlik kesintiyi karşılar. */
const MAX_ORDER_CONFIRMATION_ATTEMPTS = 8
const ORDER_CONFIRMATION_TEMPLATE = "order-confirmation"

export type NotificationRow = {
  id: string
  idempotency_key?: string | null
  status?: string | null
  template?: string | null
  resource_id?: string | null
}

export type FailedEmail = {
  template: string
  resourceId: string | null
  attempts: number
}

/** Aynı mailin denemeleri `#r<n>` ekiyle ayrılır; biri başarılıysa mail gitmiştir. */
export function findUnresolvedEmails(rows: NotificationRow[]): FailedEmail[] {
  const groups = new Map<string, NotificationRow[]>()
  for (const row of rows) {
    const key = row.idempotency_key?.replace(/#r\d+$/, "") || row.id
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const unresolved: FailedEmail[] = []
  for (const group of groups.values()) {
    const statuses = group.map((r) => r.status)
    if (statuses.includes(NotificationStatus.SUCCESS)) continue
    if (!statuses.includes(NotificationStatus.FAILURE)) continue
    unresolved.push({
      template: group[0].template || "bilinmiyor",
      resourceId: group[0].resource_id || null,
      attempts: group.length,
    })
  }
  return unresolved
}

function shouldRetry(email: FailedEmail): email is FailedEmail & { resourceId: string } {
  return (
    email.template === ORDER_CONFIRMATION_TEMPLATE &&
    Boolean(email.resourceId) &&
    email.attempts < MAX_ORDER_CONFIRMATION_ATTEMPTS
  )
}

/**
 * Gönderilemeyen mailleri ele alır. Medusa mail içeriğini saklamadığından yalnız
 * sipariş onayı (siparişten yeniden üretilebilir) tekrar denenir; diğerleri için
 * günde bir uyarı düşer. Şifre sıfırlama gibi süreli linkler zaten tekrar gönderilmemeli.
 */
export async function processFailedEmails(
  container: MedusaContainer
): Promise<{ retried: number; recovered: number; unresolved: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const notification = container.resolve(Modules.NOTIFICATION)

  const rows = (await notification.listNotifications(
    {
      channel: "email",
      created_at: { $gte: new Date(Date.now() - LOOKBACK_MS) },
    } as never,
    {
      select: ["id", "idempotency_key", "status", "template", "resource_id"],
      take: MAX_ROWS,
      order: { created_at: "DESC" },
    }
  )) as NotificationRow[]

  const remaining: FailedEmail[] = []
  let retried = 0
  let recovered = 0

  for (const email of findUnresolvedEmails(rows)) {
    if (!shouldRetry(email)) {
      remaining.push(email)
      continue
    }
    try {
      const result = await sendOrderConfirmationEmail(container, email.resourceId)
      if (result.skipped === "canceled") continue
      retried++
      if (result.sent) recovered++
      else remaining.push(email)
    } catch (err) {
      retried++
      logger.error(`[failed-emails] order=${email.resourceId}: ${errorText(err)}`)
      remaining.push(email)
    }
  }

  const byTemplate = new Map<string, FailedEmail[]>()
  for (const email of remaining) {
    byTemplate.set(email.template, [...(byTemplate.get(email.template) ?? []), email])
  }

  for (const [template, emails] of byTemplate) {
    const orders = emails.flatMap((e) => (e.resourceId ? [e.resourceId] : []))
    await recordOpsEvent(container, {
      kind: "mail.failed",
      level: "error",
      // Kaydı olmayan mailler (şifre sıfırlama) yalnız adetle ayrışır.
      title: dailyTitle(`${template} maili gönderilemedi`, [...orders, String(emails.length)]),
      detail: `${emails.length} mail.${orders.length ? ` Kayıtlar: ${orders.join(", ")}` : ""}`,
      oncePerTitle: true,
    })
  }

  return { retried, recovered, unresolved: remaining.length }
}
