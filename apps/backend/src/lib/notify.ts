import type { CreateNotificationDTO, INotificationModuleService } from "@medusajs/framework/types"
import { NotificationStatus } from "@medusajs/framework/utils"

type NotificationLike = { id: string; idempotency_key?: string | null; status?: string | null }

/** Gerçek modül servisi ya da testlerdeki sahte (yalnız createNotifications). */
type NotificationServiceLike =
  | INotificationModuleService
  | {
      createNotifications: (data: CreateNotificationDTO) => Promise<unknown>
      listNotifications?: (filters: Record<string, unknown>, config?: Record<string, unknown>) => Promise<NotificationLike[]>
    }

export type NotifyResult = { sent: boolean; skipped?: "already_sent"; idempotency_key?: string }

/**
 * `createNotifications` sarmalayıcısı — Medusa'nın idempotency hatasını aşar.
 *
 * Medusa, aynı `idempotency_key` ile daha önce BAŞARISIZ olmuş bildirimi
 * yeniden işlerken yeni bir id üretip var olmayan satırı güncellemeye çalışır
 * → "Notification with id noti_… not found" (mail aslında gitmiş olabilir;
 * 21.10 #72 iade kodu). Burada: başarılı kayıt varsa gönderilmez; başarısız
 * kayıt(lar) varsa anahtara `#r<n>` eklenir ve yeni satır olarak gönderilir.
 */
export async function createNotificationIdempotent(
  service: NotificationServiceLike,
  data: CreateNotificationDTO
): Promise<NotifyResult> {
  const key = data.idempotency_key || undefined
  const svc = service as {
    createNotifications: (data: CreateNotificationDTO) => Promise<unknown>
    listNotifications?: (filters: Record<string, unknown>, config?: Record<string, unknown>) => Promise<NotificationLike[]>
  }
  if (key && typeof svc.listNotifications === "function") {
    let existing: NotificationLike[] = []
    try {
      existing = (await svc.listNotifications(
        { $or: [{ idempotency_key: key }, { idempotency_key: { $like: `${key}#r%` } }] },
        { select: ["id", "idempotency_key", "status"], take: 50 }
      )) as NotificationLike[]
    } catch {
      existing = []
    }
    if (existing.some((n) => n.status === NotificationStatus.SUCCESS)) {
      return { sent: false, skipped: "already_sent", idempotency_key: key }
    }
    if (existing.length) {
      const retryKey = `${key}#r${existing.length}`
      await svc.createNotifications({ ...data, idempotency_key: retryKey })
      return { sent: true, idempotency_key: retryKey }
    }
  }
  await svc.createNotifications(data)
  return { sent: true, idempotency_key: key }
}
