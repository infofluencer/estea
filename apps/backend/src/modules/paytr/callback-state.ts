/**
 * PayTR callback'inin payment session data'sında bıraktığı izler — saf fonksiyonlar
 * (Medusa import'u yok; birim testlenebilir).
 *
 * Kurallar (Mareen dersleri):
 *  - İdempotency (`callback_processed`) YALNIZCA success için yazılır.
 *  - Failed bildirimde sipariş iptal edilmez, oturum kilitlenmez; yalnızca sayaç +
 *    sebep yazılır. PayTR 3D Secure başarısız olunca müşteriye aynı merchant_oid ile
 *    tekrar deneme sunar; ikinci deneme success gelebilir.
 *  - Vazgeçen müşterinin siparişini temizlik işi (UNPAID_ORDER_TIMEOUT_MINUTES) iptal eder;
 *    son başarısız deneme eşiğin içindeyse müşteri hâlâ deniyordur, iş bekler.
 */

export type PaytrFailedReason = {
  code?: string | null
  msg?: string | null
}

export type PaytrCallbackSessionData = Record<string, unknown> & {
  paytr_status?: string
  callback_processed?: boolean
  paytr_failed_attempts?: number
  paytr_last_failed_at?: string
  failed_reason?: string
  manual_review?: boolean
}

/** Failed bildirim sonrası yeni session data: sayaç +1, son sebep, zaman damgası. */
export function nextFailedAttemptData(
  prev: Record<string, unknown> | null | undefined,
  reason: PaytrFailedReason,
  now: Date = new Date()
): PaytrCallbackSessionData {
  const prior = Number(prev?.paytr_failed_attempts) || 0
  const text = `${reason.code || ""} ${reason.msg || ""}`.trim()
  return {
    ...(prev || {}),
    // paytr_status "pending" kalır: authorizePayment / getPaymentStatus ERROR'a düşmez,
    // aynı merchant_oid ile gelen success normal yoldan capture edilir.
    paytr_failed_attempts: prior + 1,
    paytr_last_failed_at: now.toISOString(),
    failed_reason: text || "bilinmiyor",
  }
}

/**
 * Bu session için callback akışı sonuçlanmış mı? (success capture edildi ya da
 * tutarsızlık elle incelemeye alındı). Temizlik işi bu siparişlere dokunmaz —
 * para PayTR'de olabilir.
 */
export function isCallbackSettled(
  data: Record<string, unknown> | null | undefined
): boolean {
  return data?.callback_processed === true || data?.manual_review === true
}

/**
 * Müşteri hâlâ ödemeyi deniyor mu? Son başarısız deneme `cutoff`'tan yeniyse evet.
 * Temizlik işi created_at yerine son denemeden itibaren süre tanır.
 */
export function isRetryingSince(
  data: Record<string, unknown> | null | undefined,
  cutoff: Date
): boolean {
  const raw = data?.paytr_last_failed_at
  if (typeof raw !== "string" || !raw) return false
  const at = new Date(raw)
  if (Number.isNaN(at.getTime())) return false
  return at.getTime() > cutoff.getTime()
}

export type PaytrSuccessAnomalyKind =
  | "late_success_canceled"
  | "amount_mismatch"
  | "success_no_order"

/** Elle incelemeye alınan success için session'a yazılacak durum. */
export function manualReviewStatusFor(kind: PaytrSuccessAnomalyKind): string {
  switch (kind) {
    case "late_success_canceled":
      return "success_on_canceled_order"
    case "amount_mismatch":
      return "success_amount_mismatch"
    case "success_no_order":
      return "success_no_order"
  }
}

/**
 * Tutarsız success'te otomatik iade yapılsın mı? Varsayılan HAYIR — para PayTR'de
 * tutulur, uyarı maili gider, admin siparişi yeniden açar ya da panelden iade eder.
 * (Mareen'de geç success otomatik iadesi gerçek siparişin parasını iade edecekti.)
 */
export function callbackAutoRefundEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (env.PAYTR_CALLBACK_AUTO_REFUND || "").trim() === "1"
}
