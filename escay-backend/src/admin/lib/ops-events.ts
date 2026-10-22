/** Admin — olay kaydı ortak tipler ve etiketler (backend src/lib/ops-events.ts ile aynı türler). */

export type OpsEvent = {
  id: string
  kind: string
  level: "info" | "warning" | "error"
  title: string
  detail?: string | null
  order_id?: string | null
  order_display_id?: string | null
  data?: Record<string, unknown> | null
  created_at: string
}

export const OPS_KIND_LABEL: Record<string, string> = {
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

export const OPS_LEVEL_BADGE: Record<OpsEvent["level"], { label: string; color: "green" | "orange" | "red" | "grey" }> = {
  info: { label: "Bilgi", color: "green" },
  warning: { label: "Uyarı", color: "orange" },
  error: { label: "Hata", color: "red" },
}

export function formatEventDate(value: string): string {
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export async function fetchOpsEvents(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v))
  const res = await fetch(`/admin/ops-events?${qs.toString()}`, { credentials: "include" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<{ events: OpsEvent[]; count: number; limit: number; offset: number }>
}
