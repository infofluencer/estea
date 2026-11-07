import { COMPANY } from "./company"
import { EMAIL_STYLES, emailLayout, escapeHtml } from "./format"

export type PaytrCriticalAlertKind =
  | "late_success_canceled"
  | "amount_mismatch"
  | "currency_mismatch"
  | "order_canceled"
  | "success_no_order"
  | "session_not_found"
  | "duplicate_payment"
  | "cart_changed"
  | "order_create_failed"
  | "compensate_failed"
  | "process_failed"

export type PaytrCriticalAlertData = {
  kind: PaytrCriticalAlertKind
  merchantOid: string
  orderId?: string | null
  sessionId?: string | null
  callbackAmountKurus?: string | null
  sessionAmount?: string | null
  detail?: string | null
}

const KIND_LABEL: Record<PaytrCriticalAlertKind, string> = {
  late_success_canceled:
    "PayTR success, sipariş iptal — para alındı; elle işlenmeli (otomatik iade yalnızca PAYTR_CALLBACK_AUTO_REFUND=1)",
  amount_mismatch:
    "PayTR callback payment_amount session tutarından farklı — para alınmış olabilir; elle inceleyin (otomatik iade yalnızca PAYTR_CALLBACK_AUTO_REFUND=1)",
  currency_mismatch:
    "PayTR ödemesinin para birimi denemeyle tutmuyor — para alınmış olabilir, sipariş açılmadı; PayTR panelinden kontrol edin",
  order_canceled:
    "PayTR success, bu sepetin siparişi iptal edilmiş — para alındı, tahsilat yazılmadı; siparişi yeniden açın ya da iade edin",
  success_no_order:
    "PayTR success, Medusa siparişi yok — para alındı; elle inceleyin (otomatik iade yalnızca PAYTR_CALLBACK_AUTO_REFUND=1)",
  session_not_found:
    "PayTR success, ödeme oturumu bulunamadı — para alındı; PayTR panelinde müşteriyi bulup siparişi elle işleyin",
  duplicate_payment:
    "Aynı sepet iki kez ödendi — ikinci sipariş açılmadı; bu ödemeyi PayTR panelinden iade edin",
  cart_changed:
    "PayTR success, sepet ödeme sırasında değişmiş — para alındı, sipariş açılmadı; elle işleyin",
  order_create_failed:
    "PayTR success, sipariş oluşturulamadı — para alındı (ör. stok); sistem tekrar deniyor",
  compensate_failed: "PayTR iade telafisi başarısız — para içeride kalmış olabilir",
  process_failed: "PayTR success işlenemedi (workflow) — PayTR retry bekleniyor",
}

export function buildPaytrCriticalAlertEmail(data: PaytrCriticalAlertData): {
  subject: string
  html: string
  text: string
} {
  const title = KIND_LABEL[data.kind]
  const subject = `[KRİTİK] PayTR tutarsızlık — ${data.merchantOid}`
  const rows = [
    ["Olay", title],
    ["merchant_oid", data.merchantOid],
    ["order_id", data.orderId || "—"],
    ["session_id", data.sessionId || "—"],
    ["callback tutar (kuruş)", data.callbackAmountKurus || "—"],
    ["session tutar", data.sessionAmount || "—"],
    ["ayrıntı", data.detail || "—"],
  ]

  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:${EMAIL_STYLES.mutedColor};width:40%;">${escapeHtml(k)}</td>` +
        `<td style="padding:8px 0;"><strong>${escapeHtml(String(v))}</strong></td></tr>`
    )
    .join("")

  const html = emailLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;color:${EMAIL_STYLES.brandColor};">PayTR tutarsızlık</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:22px;color:${EMAIL_STYLES.mutedColor};">
      ${escapeHtml(title)}. Panel Bildirim URL değişmedi; bu uyarı Medusa tarafındandır.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${htmlRows}</table>
    <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_STYLES.mutedColor};">
      ${escapeHtml(COMPANY.emailOps)}
    </p>
  `)

  const text = `${subject}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n`
  return { subject, html, text }
}
